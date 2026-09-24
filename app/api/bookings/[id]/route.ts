import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { validateAssignee, notifyTripAssignment } from '@/lib/trip-assignee'
import { checkStatusChange, normalizeStatusChoice, OPERATOR_STATUS_CHOICES } from '@/lib/bookings/booking-status'

// GET single booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params


    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()

    const { data: booking, error } = await adminClient
      .from('bookings')
      .select(`
        *,
        itineraries (
          id,
          itinerary_code,
          trip_name,
          client_name,
          start_date,
          end_date,
          total_days,
          notes
        ),
        clients (
          id,
          full_name,
          email,
          phone,
          whatsapp
        ),
        b2b_partners (
          id,
          company_name,
          email,
          phone
        )
      `)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (error || !booking) {
      console.error('❌ Booking not found:', error)
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Fetch passengers
    const { data: passengers } = await adminClient
      .from('booking_passengers')
      .select('*')
      .eq('booking_id', id)
      .eq('tenant_id', tenant_id)
      .order('is_lead_passenger', { ascending: false })

    // Fetch payments
    const { data: payments } = await adminClient
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .eq('tenant_id', tenant_id)
      .order('payment_date', { ascending: false })



    return NextResponse.json({
      success: true,
      data: {
        ...booking,
        passengers: passengers || [],
        payments: payments || []
      }
    })
  } catch (error: any) {
    console.error('❌ Error in booking GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH booking (update)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params


    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role } = authResult

    // Only managers and above can update bookings
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()
    const body = await request.json()

    const {
      status,
      special_requests,
      dietary_requirements,
      internal_notes,
      payment_deadline,
      cancellation_reason,
      assigned_to,
      status_override_ack
    } = body

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() }

    if (status !== undefined) {
      // The operator's choices (lib/bookings/booking-status.ts). Payment
      // statuses are never typed in: 'active' — and the old payment values,
      // which mean the same — hands the status back to the money (migration
      // 388's trigger re-derives it when total_paid is in the update).
      const choice = normalizeStatusChoice(status)
      if (!choice) {
        return NextResponse.json(
          { success: false, error: `status must be one of: ${OPERATOR_STATUS_CHOICES.join(', ')}` },
          { status: 400 }
        )
      }

      const [{ data: current }, { data: supplierRows }] = await Promise.all([
        adminClient.from('bookings').select('total_paid').eq('id', id).eq('tenant_id', tenant_id).maybeSingle(),
        adminClient.from('booking_supplier_status').select('status').eq('booking_id', id).eq('tenant_id', tenant_id),
      ])
      if (!current) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
      }

      const check = checkStatusChange(choice, supplierRows, status_override_ack === true)
      if (!check.ok) {
        return NextResponse.json(
          { success: false, code: check.code, error: check.message, backing: check.backing },
          { status: 409 }
        )
      }

      if (choice === 'active') {
        updates.status = 'pending_deposit'
        updates.total_paid = current.total_paid ?? 0 // fires the status trigger
      } else {
        updates.status = choice
      }
      if (choice === 'cancelled') updates.cancellation_date = new Date().toISOString().split('T')[0]

      // Recorded only when the operator went ahead without supplier backing;
      // any other status change clears it (it describes the current status).
      updates.status_override = check.overridden
        ? {
            to: choice,
            by: authResult.user.id,
            email: authResult.user.email ?? null,
            at: new Date().toISOString(),
            confirmed: check.backing.confirmed,
            total: check.backing.total,
          }
        : null
    }

    if (special_requests !== undefined) updates.special_requests = special_requests
    if (dietary_requirements !== undefined) updates.dietary_requirements = dietary_requirements
    if (internal_notes !== undefined) updates.internal_notes = internal_notes
    if (payment_deadline !== undefined) updates.payment_deadline = payment_deadline
    if (cancellation_reason !== undefined) updates.cancellation_reason = cancellation_reason

    // Trip owner (migration 272). This route uses the admin client, which
    // bypasses RLS, so the tenant filter has to be passed explicitly —
    // otherwise any team_members id in the database would be accepted.
    let newAssignee: string | null = null
    if (assigned_to !== undefined) {
      if (assigned_to === null || assigned_to === '') {
        updates.assigned_to = null
      } else {
        const check = await validateAssignee(adminClient, assigned_to, tenant_id)
        if (!check.ok) {
          return NextResponse.json({ success: false, error: check.error }, { status: 400 })
        }
        updates.assigned_to = assigned_to
        newAssignee = assigned_to
      }
    }

    // Only notify on an actual change of owner, not on every save.
    let previousAssignee: string | null = null
    if (newAssignee) {
      const { data: current } = await adminClient
        .from('bookings')
        .select('assigned_to')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle()
      previousAssignee = (current as { assigned_to?: string | null } | null)?.assigned_to ?? null
    }

    // Update the booking
    const { data: booking, error } = await adminClient
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .single()

    if (error) {
      console.error('❌ Error updating booking:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update booking', details: error.message },
        { status: 500 }
      )
    }



    if (newAssignee && newAssignee !== previousAssignee) {
      const row = booking as { booking_number?: string | null; trip_name?: string | null }
      await notifyTripAssignment({
        assigneeId: newAssignee,
        tripLabel: row?.booking_number || row?.trip_name || 'this booking',
        kind: 'booking',
        link: `/bookings/${id}`,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Booking updated successfully',
      data: booking
    })
  } catch (error: any) {
    console.error('❌ Error in booking PATCH:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params


    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role } = authResult

    // Only managers and above can delete bookings
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    // Check if booking exists and belongs to tenant
    const { data: booking, error: fetchError } = await adminClient
      .from('bookings')
      .select('booking_number, status')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (fetchError || !booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Don't allow deletion of confirmed or in-progress bookings
    if (['confirmed', 'paid_full', 'in_progress'].includes(booking.status)) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete confirmed or in-progress bookings. Cancel them instead.' },
        { status: 400 }
      )
    }

    // Delete the booking (CASCADE will delete passengers and payments)
    const { error } = await adminClient
      .from('bookings')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('❌ Error deleting booking:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete booking', details: error.message },
        { status: 500 }
      )
    }



    return NextResponse.json({
      success: true,
      message: 'Booking deleted successfully'
    })
  } catch (error: any) {
    console.error('❌ Error in booking DELETE:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
