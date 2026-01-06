import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('Error fetching invoice payments:', error)
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in invoice payments GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate required fields
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    // Verify invoice exists and get current balance
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('balance_due, currency')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Check if payment exceeds balance (allow small overpayment for rounding)
    if (body.amount > Number(invoice.balance_due) + 0.01) {
      return NextResponse.json(
        { error: `Payment amount exceeds balance due (${invoice.balance_due})` },
        { status: 400 }
      )
    }

    const newPayment = {
      invoice_id: id,
      amount: body.amount,
      currency: body.currency || invoice.currency || 'EUR',
      payment_method: body.payment_method || 'bank_transfer',
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      transaction_reference: body.transaction_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('invoice_payments')
      .insert([newPayment])
      .select()
      .single()

    if (error) {
      console.error('Error creating payment:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    // Note: The trigger function will automatically update the invoice's
    // amount_paid, balance_due, and status

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in invoice payments POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}