import { NextResponse } from 'next/server'
import { evaluateDeleteGuard } from '@/lib/delete-guard'
import { createAuthenticatedClient, createAdminClient } from '@/lib/supabase-server'
import { validateAssignee, notifyTripAssignment } from '@/lib/trip-assignee'
import { buildFrozenFx } from '@/lib/itinerary-fx'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { itineraryBookingFacts } from '@/lib/bookings/booking-on-confirm'
import { resolveDepositRule } from '@/lib/bookings/deposit-rule'

/**
 * Create the booking a freshly-confirmed itinerary implies (B-item 7).
 *
 * Never throws and never blocks the confirm: any reason a booking cannot
 * honestly exist comes back as `note` for the operator. The tenant-scoped
 * itinerary row has already been fetched through RLS; the insert runs on
 * the admin client with that row's tenant_id (bookings writes follow the
 * same pattern as /api/bookings/from-quote).
 */
async function createBookingOnConfirm(
  itineraryId: string,
  itinerary: Record<string, unknown>
): Promise<{ booking: Record<string, unknown> | null; note: string | null }> {
  try {
    const tenantId = itinerary.tenant_id
    if (typeof tenantId !== 'string') {
      return { booking: null, note: 'Booking not created: could not resolve the tenant.' }
    }
    const admin = createAdminClient()

    // Any existing booking for this itinerary — quote-born or direct —
    // means the money is already frozen somewhere; never create a second.
    const { data: existing } = await admin
      .from('bookings')
      .select('id, booking_number')
      .eq('itinerary_id', itineraryId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return {
        booking: null,
        note: `This itinerary already has booking ${existing.booking_number}.`,
      }
    }

    const facts = itineraryBookingFacts(itinerary)
    if (!facts.ok) {
      return { booking: null, note: `Booking not created: ${facts.reason}.` }
    }

    const { data: tenantRow } = await admin
      .from('tenants')
      .select('deposit_percent, deposit_due_days')
      .eq('id', tenantId)
      .maybeSingle()
    const rule = resolveDepositRule({ tenant: tenantRow })

    const { data: bookingNumber, error: numberError } = await admin.rpc('generate_booking_number')
    if (numberError || !bookingNumber) {
      return { booking: null, note: 'Booking not created: could not generate a booking number.' }
    }

    const deposit_amount = Math.round(((facts.value.total_amount * rule.depositPercent) / 100) * 100) / 100
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + rule.depositDueDays)

    const { data: booking, error: insertError } = await admin
      .from('bookings')
      .insert({
        tenant_id: tenantId,
        itinerary_id: itineraryId,
        quote_id: null,
        quote_type: null,
        client_id: (itinerary.client_id as string | null) ?? null,
        booking_number: bookingNumber,
        booking_date: new Date().toISOString().split('T')[0],
        trip_name: facts.value.trip_name,
        start_date: facts.value.start_date,
        end_date: facts.value.end_date,
        total_days: facts.value.total_days,
        num_travelers: facts.value.num_travelers,
        total_amount: facts.value.total_amount,
        currency: facts.value.currency,
        payment_terms: `${rule.depositPercent}% deposit due within ${rule.depositDueDays} day${rule.depositDueDays === 1 ? '' : 's'}, balance before departure`,
        deposit_amount,
        deposit_percent: rule.depositPercent,
        total_paid: 0,
        balance_due: facts.value.total_amount,
        status: 'pending_deposit',
        payment_deadline: deadline.toISOString().split('T')[0],
      })
      .select()
      .single()

    if (insertError) {
      // 23505 on uq_bookings_direct_per_itinerary: a concurrent confirm won
      // the race — return ITS booking, the itinerary is booked either way.
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('bookings')
          .select('id, booking_number')
          .eq('itinerary_id', itineraryId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        if (raced) {
          return { booking: null, note: `This itinerary already has booking ${raced.booking_number}.` }
        }
      }
      console.error('booking-on-confirm insert failed:', insertError)
      return { booking: null, note: 'Booking not created: the insert failed — see server logs.' }
    }

    return { booking, note: null }
  } catch (err) {
    console.error('booking-on-confirm failed:', err)
    return { booking: null, note: 'Booking not created: unexpected error — see server logs.' }
  }
}

/**
 * GET /api/itineraries/[id]
 * Get a single itinerary by ID
 * RLS policies enforce tenant isolation
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Use authenticated client - RLS will enforce tenant isolation
    const supabase = await createAuthenticatedClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // ?include=days → nest the itinerary's days (each with its services), e.g.
    // so the pricing grid can load an existing itinerary. Off by default.
    const url = new URL(request.url)
    if (url.searchParams.get('include') === 'days') {
      const { data: days } = await supabase
        .from('itinerary_days')
        .select('*, itinerary_services(*)')
        .eq('itinerary_id', id)
        .order('day_number', { ascending: true })
      ;(data as any).itinerary_days = days || []
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/itineraries/[id]
 * Update an itinerary
 * RLS policies enforce tenant isolation
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Use authenticated client - RLS will enforce tenant isolation
    const supabase = await createAuthenticatedClient()
    const { id } = await params
    const body = await request.json()

    // Prepare update data - include ALL fields that might be sent
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Basic itinerary fields
    if (body.client_name !== undefined) updateData.client_name = body.client_name
    if (body.client_email !== undefined) updateData.client_email = body.client_email
    if (body.client_phone !== undefined) updateData.client_phone = body.client_phone
    if (body.trip_name !== undefined) updateData.trip_name = body.trip_name
    if (body.start_date !== undefined) updateData.start_date = body.start_date
    if (body.end_date !== undefined) updateData.end_date = body.end_date
    if (body.num_adults !== undefined) updateData.num_adults = body.num_adults
    if (body.num_children !== undefined) updateData.num_children = body.num_children
    if (body.total_cost !== undefined) updateData.total_cost = body.total_cost
    if (body.status !== undefined) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes

    // Assignments consolidated (mig 289): the assigned_* columns are DERIVED
    // from itinerary_resources and the database rejects direct writes. This
    // was the second writer — refuse loudly rather than 500 on the trigger.
    if (body.assigned_guide_id !== undefined || body.assigned_vehicle_id !== undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Assignments are managed through itinerary resources now — use POST /api/itinerary-resources. The assigned_* fields on the itinerary are derived automatically.',
        },
        { status: 400 }
      )
    }
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.pickup_time !== undefined) updateData.pickup_time = body.pickup_time

    // Trip owner (migration 272). `null` clears the assignment; any other value
    // must be an active team member of the caller's tenant — RLS scopes the
    // lookup, so a foreign id simply isn't found.
    let newAssignee: string | null = null
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === null || body.assigned_to === '') {
        updateData.assigned_to = null
      } else {
        const check = await validateAssignee(supabase, body.assigned_to)
        if (!check.ok) {
          return NextResponse.json({ success: false, error: check.error }, { status: 400 })
        }
        updateData.assigned_to = body.assigned_to
        newAssignee = body.assigned_to
      }
    }

    // FX FREEZE (P4): at the FIRST transition to 'confirmed', stamp the
    // active exchange-rate snapshot. Stamped once — a re-confirm or a later
    // status bounce never restamps; only the explicit reprice endpoint may.
    // Deploy-order safe: if the fx_frozen column does not exist yet
    // (migration 296 unapplied), the current row has no such key and the
    // freeze is skipped entirely.
    if (body.status === 'confirmed') {
      const { data: current } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const row = current as (Record<string, unknown> & { status?: string }) | null
      if (row && 'fx_frozen' in row && row.fx_frozen == null && row.status !== 'confirmed') {
        const { data: fxRates } = await supabase
          .from('exchange_rates')
          .select('base_currency, target_currency, rate, is_active')
          .eq('is_active', true)
        if (fxRates && fxRates.length > 0) {
          const { data: { user: fxUser } } = await supabase.auth.getUser()
          const fxBase = typeof row.tenant_id === 'string'
            ? await getTenantRunCurrency(supabase, row.tenant_id)
            : undefined
          updateData.fx_frozen = buildFrozenFx(fxRates, fxUser?.id ?? null, 'confirm', undefined, fxBase)
        }
      }
    }

    // Read the current owner first so the notification only fires on a real
    // change (a PUT that resends the same assignee shouldn't re-notify).
    let previousAssignee: string | null = null
    if (newAssignee) {
      const { data: current } = await supabase
        .from('itineraries')
        .select('assigned_to')
        .eq('id', id)
        .maybeSingle()
      previousAssignee = (current as { assigned_to?: string | null } | null)?.assigned_to ?? null
    }

    const { data, error } = await supabase
      .from('itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (newAssignee && newAssignee !== previousAssignee) {
      const row = data as { itinerary_code?: string | null; trip_name?: string | null }
      await notifyTripAssignment({
        assigneeId: newAssignee,
        tripLabel: row?.trip_name || row?.itinerary_code || 'this itinerary',
        kind: 'itinerary',
        link: `/itineraries/${id}`,
      })
    }

    // BOOKING ON CONFIRM (B-item 7): confirmation is the commercial event,
    // so it creates the booking — through the org's own deposit rule, never
    // a hardcoded 30%. A reason the itinerary cannot honestly be booked is
    // surfaced as booking_note, never allowed to block the confirm itself.
    let booking: Record<string, unknown> | null = null
    let bookingNote: string | null = null
    if (body.status === 'confirmed') {
      const result = await createBookingOnConfirm(id, data as Record<string, unknown>)
      booking = result.booking
      bookingNote = result.note
    }

    return NextResponse.json({
      success: true,
      data,
      ...(booking ? { booking } : {}),
      ...(bookingNote ? { booking_note: bookingNote } : {}),
    })
  } catch (error) {
    console.error('Error updating itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/itineraries/[id]
 * Delete an itinerary and all related data
 * RLS policies enforce tenant isolation
 * Note: RLS policy requires 'manager' role or higher
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Use authenticated client - RLS will enforce tenant isolation and role permission
    const supabase = await createAuthenticatedClient()
    const { id } = await params

    // ────────────────────────────────────────────────────────────────────
    // WHY THIS WAS REWRITTEN
    // The old handler deleted itinerary_services, then itinerary_days, then
    // the itinerary — as three separate statements with no transaction. But
    // bookings.itinerary_id is ON DELETE RESTRICT, so if a booking existed
    // the FINAL delete raised 23503 AFTER the days and services were already
    // gone. The user saw a tidy "cannot delete" 409 while the itinerary
    // survived, gutted of its content, with a live booking pointing at it.
    // Reproduced against production before this fix.
    //
    // The database already deletes an itinerary correctly on its own:
    //   days, services, resources, shares, draft quotes → ON DELETE CASCADE
    //   bookings                                         → ON DELETE RESTRICT
    //   invoices, payments, commissions, expenses        → ON DELETE SET NULL
    //
    // So: (1) block up front on anything that must not be silently lost —
    // the RESTRICT relation (a raw 23503 is a poor message) AND the SET NULL
    // money relations (a successful delete would silently ORPHAN them). Then
    // (2) issue ONE delete and let the DB cascade the safe children in a
    // single atomic statement. Nothing is destroyed unless everything can be.
    // ────────────────────────────────────────────────────────────────────

    const [bookings, invoices, payments, commissions, quotes] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('itinerary_id', id),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('itinerary_id', id),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('itinerary_id', id),
      supabase.from('commissions').select('id', { count: 'exact', head: true }).eq('itinerary_id', id),
      // Draft quotes cascade harmlessly; a quote the client has SEEN must not
      // vanish silently.
      supabase.from('b2c_quotes').select('id', { count: 'exact', head: true })
        .eq('itinerary_id', id).neq('status', 'draft'),
    ])

    const guard = evaluateDeleteGuard('itinerary', [
      { label: `${bookings.count} booking(s)`, count: bookings.count, error: bookings.error },
      { label: `${invoices.count} invoice(s)`, count: invoices.count, error: invoices.error },
      { label: `${payments.count} payment(s)`, count: payments.count, error: payments.error },
      { label: `${commissions.count} commission(s)`, count: commissions.count, error: commissions.error },
      { label: `${quotes.count} sent quote(s)`, count: quotes.count, error: quotes.error },
    ])
    if (!guard.ok) {
      if (guard.kind === 'error') console.error('❌ Itinerary delete pre-check failed:', guard.label)
      return NextResponse.json(
        { success: false, error: guard.message },
        { status: guard.kind === 'error' ? 500 : 409 }
      )
    }

    // ONE statement. The database cascades days, services, resources, shares
    // and any draft quotes atomically; a RESTRICT that slipped in between the
    // check and here rolls the whole thing back rather than half-deleting.
    const { error } = await supabase.from('itineraries').delete().eq('id', id)

    if (error) {
      console.error('❌ Error deleting itinerary:', error)
      if (error.code === '23503') {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete this itinerary — a linked record was created while deleting. Nothing was deleted; please try again.',
        }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Itinerary deleted successfully'
    })

  } catch (error: any) {
    console.error('❌ Error in DELETE:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete itinerary',
        message: error.message
      },
      { status: 500 }
    )
  }
}
