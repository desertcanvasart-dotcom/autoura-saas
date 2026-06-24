import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET all payments for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
      .eq('booking_id', id)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Generate payment number. The prior code generated it before the INSERT
    // happened anyway; keeping that call here lets the existing generate_payment_number
    // RPC stay the source of payment numbering, while record_booking_payment
    // (below) handles the booking-row recomputation atomically.
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

    // Atomic payment recording via record_booking_payment (PL/pgSQL RPC).
    // Replaces what used to be: fetch booking → insert payment → recompute
    // and update booking — three separate non-transactional round-trips
    // where two concurrent callers could both read a stale total_paid and
    // both update the booking with last-write-wins. The RPC takes
    // SELECT ... FOR UPDATE on the booking row, inserts the payment,
    // recomputes total_paid from the ledger (currency-safe), updates the
    // booking (including conditional status transitions and first-time
    // confirmation_date / full_payment_date capture). balance_due is left
    // to the existing BEFORE INSERT/UPDATE trigger on bookings.
    const { data: rpcRows, error: rpcError } = await adminClient
      .rpc('record_booking_payment', {
        p_booking_id: id,
        p_tenant_id: tenant_id,
        p_payment_number: payment_number,
        p_amount: amount,
        p_payment_type: payment_type,
        p_payment_method: payment_method || null,
        p_payment_date: payment_date,
        p_transaction_reference: transaction_reference || null,
        p_notes: notes || null,
        p_created_by: user?.id || null,
      })

    if (rpcError) {
      // The RPC raises if the booking is not found for this tenant.
      const msg = rpcError.message || ''
      const status = msg.includes('not found') ? 404 : 500
      console.error('Error recording payment:', rpcError)
      return NextResponse.json(
        { success: false, error: 'Failed to record payment', details: msg },
        { status }
      )
    }

    const result = (rpcRows && rpcRows[0]) || null
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Payment RPC returned no rows' },
        { status: 500 }
      )
    }

    // Read back the payment row for the response shape callers expect.
    const { data: payment } = await adminClient
      .from('booking_payments')
      .select('*')
      .eq('id', result.payment_id)
      .single()

    return NextResponse.json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment,
      booking_status: result.new_status
    })
  } catch (error: any) {
    console.error('Error in payment POST:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
