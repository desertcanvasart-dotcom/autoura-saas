import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET all payments for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()

    const { data: payments, error } = await adminClient
      .from('booking_payments')
      .select('*')
      .eq('booking_id', params.id)
      .eq('tenant_id', tenant_id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('Error fetching payments:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch payments' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: payments || []
    })
  } catch (error: any) {
    console.error('Error in payments GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST record payment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role, user } = authResult

    // Only managers and above can record payments
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()
    const body = await request.json()

    // Fetch booking
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', tenant_id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    const {
      amount,
      payment_type = 'deposit',
      payment_method,
      payment_date = new Date().toISOString().split('T')[0],
      transaction_reference,
      notes
    } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    // Generate payment number
    const { data: paymentNumberData, error: paymentNumberError } = await adminClient
      .rpc('generate_payment_number')

    if (paymentNumberError) {
      console.error('Error generating payment number:', paymentNumberError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate payment number' },
        { status: 500 }
      )
    }

    const payment_number = paymentNumberData

    // Create payment record
    const paymentData = {
      tenant_id,
      booking_id: params.id,
      payment_number,
      amount,
      currency: booking.currency,
      payment_type,
      payment_method,
      payment_date,
      status: 'received',
      transaction_reference,
      notes,
      created_by: user?.id
    }

    const { data: payment, error: paymentError } = await adminClient
      .from('booking_payments')
      .insert(paymentData)
      .select()
      .single()

    if (paymentError) {
      console.error('Error creating payment:', paymentError)
      return NextResponse.json(
        { success: false, error: 'Failed to record payment', details: paymentError.message },
        { status: 500 }
      )
    }

    // Update booking total_paid
    const new_total_paid = parseFloat(booking.total_paid || 0) + parseFloat(amount)
    const new_balance_due = parseFloat(booking.total_amount) - new_total_paid

    let new_status = booking.status

    // Auto-update booking status based on payment
    if (payment_type === 'deposit' && booking.status === 'pending_deposit') {
      new_status = 'confirmed'
    } else if (new_balance_due <= 0) {
      new_status = 'paid_full'
    }

    const { error: bookingUpdateError } = await adminClient
      .from('bookings')
      .update({
        total_paid: new_total_paid,
        balance_due: new_balance_due,
        status: new_status,
        ...(payment_type === 'deposit' && new_status === 'confirmed' ? { confirmation_date: new Date().toISOString().split('T')[0] } : {}),
        ...(new_status === 'paid_full' ? { full_payment_date: new Date().toISOString().split('T')[0] } : {})
      })
      .eq('id', params.id)

    if (bookingUpdateError) {
      console.error('Error updating booking:', bookingUpdateError)
    }

    return NextResponse.json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment,
      booking_status: new_status
    })
  } catch (error: any) {
    console.error('Error in payment POST:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
