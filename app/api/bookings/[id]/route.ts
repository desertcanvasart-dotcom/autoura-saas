import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET single booking
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('📦 Fetching booking:', params.id)

    const authResult = await requireAuth()
    if (authResult.error) {
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
      .eq('id', params.id)
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
      .eq('booking_id', params.id)
      .eq('tenant_id', tenant_id)
      .order('is_lead_passenger', { ascending: false })

    // Fetch payments
    const { data: payments } = await adminClient
      .from('booking_payments')
      .select('*')
      .eq('booking_id', params.id)
      .eq('tenant_id', tenant_id)
      .order('payment_date', { ascending: false })

    console.log('✅ Booking fetched:', booking.booking_number)

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
  { params }: { params: { id: string } }
) {
  try {
    console.log('📝 Updating booking:', params.id)

    const authResult = await requireAuth()
    if (authResult.error) {
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
      cancellation_reason
    } = body

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() }

    if (status !== undefined) {
      // Validate status transitions
      const validStatuses = ['pending_deposit', 'confirmed', 'paid_full', 'in_progress', 'completed', 'cancelled']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status' },
          { status: 400 }
        )
      }
      updates.status = status

      // Set dates based on status changes
      if (status === 'confirmed') {
        updates.confirmation_date = new Date().toISOString().split('T')[0]
      } else if (status === 'cancelled') {
        updates.cancellation_date = new Date().toISOString().split('T')[0]
      } else if (status === 'paid_full') {
        updates.full_payment_date = new Date().toISOString().split('T')[0]
      }
    }

    if (special_requests !== undefined) updates.special_requests = special_requests
    if (dietary_requirements !== undefined) updates.dietary_requirements = dietary_requirements
    if (internal_notes !== undefined) updates.internal_notes = internal_notes
    if (payment_deadline !== undefined) updates.payment_deadline = payment_deadline
    if (cancellation_reason !== undefined) updates.cancellation_reason = cancellation_reason

    // Update the booking
    const { data: booking, error } = await adminClient
      .from('bookings')
      .update(updates)
      .eq('id', params.id)
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

    console.log('✅ Booking updated:', booking.booking_number)

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
  { params }: { params: { id: string } }
) {
  try {
    console.log('🗑️ Deleting booking:', params.id)

    const authResult = await requireAuth()
    if (authResult.error) {
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
      .eq('id', params.id)
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
      .eq('id', params.id)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('❌ Error deleting booking:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete booking', details: error.message },
        { status: 500 }
      )
    }

    console.log('✅ Booking deleted:', booking.booking_number)

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
