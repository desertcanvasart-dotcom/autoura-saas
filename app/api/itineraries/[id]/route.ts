import { NextResponse } from 'next/server'
import { evaluateDeleteGuard } from '@/lib/delete-guard'
import { createAuthenticatedClient } from '@/lib/supabase-server'

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

    // Resource fields
    if (body.assigned_guide_id !== undefined) updateData.assigned_guide_id = body.assigned_guide_id
    if (body.assigned_vehicle_id !== undefined) updateData.assigned_vehicle_id = body.assigned_vehicle_id
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.pickup_time !== undefined) updateData.pickup_time = body.pickup_time

    const { data, error } = await supabase
      .from('itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
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
