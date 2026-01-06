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
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching invoice:', error)
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in invoice GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // List of allowed fields to update
    const allowedFields = [
      'client_id', 'itinerary_id', 'client_name', 'client_email',
      'line_items', 'subtotal', 'tax_rate', 'tax_amount', 'discount_amount',
      'total_amount', 'currency', 'amount_paid', 'balance_due', 'status',
      'issue_date', 'due_date', 'notes', 'payment_terms', 'payment_instructions',
      'sent_at', 'paid_at'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // If total_amount is updated, recalculate balance_due
    if (updateData.total_amount !== undefined) {
      const { data: currentInvoice } = await supabaseAdmin
        .from('invoices')
        .select('amount_paid')
        .eq('id', id)
        .single()
      
      if (currentInvoice) {
        updateData.balance_due = updateData.total_amount - (currentInvoice.amount_paid || 0)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating invoice:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in invoice PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // First delete related payments
    await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', id)

    // Then delete the invoice
    const { error } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting invoice:', error)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invoice DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}