// app/api/invoices/[id]/route.ts
// ============================================
// AUTOURA - SINGLE INVOICE API
// ============================================
// Get/Update/Delete individual invoice
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { invoiceBalance } from '@/lib/invoices/invoice-balance'
import { roundToCurrency } from '@/lib/currency-totals'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('❌ Error fetching invoice:', error)
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in invoice GET:', error)
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
    // Use authenticated client - RLS enforces tenant boundaries
    const supabase = await createAuthenticatedClient()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // List of allowed fields to update.
    // amount_paid / balance_due / paid_at are DERIVED from payment activity
    // (see the payments routes) and MUST NOT be writable through this edit
    // endpoint — otherwise a caller could PUT { amount_paid: 9999, paid_at: ... }
    // and mark the invoice paid without recording an actual payment.
    const allowedFields = [
      'client_id', 'itinerary_id', 'client_name', 'client_email',
      'line_items', 'subtotal', 'tax_rate', 'tax_amount', 'discount_amount',
      'total_amount', 'currency', 'status',
      'issue_date', 'due_date', 'notes', 'payment_terms', 'payment_instructions',
      'sent_at'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // A new total or currency re-derives what is due and the paid / part-paid
    // status from the payments (lib/invoices/invoice-balance). Only
    // balance_due moved before — unrounded, with the status left as it was —
    // and an empty or negative total, or a currency change after payments
    // were taken in the old one, went through.
    if (updateData.total_amount !== undefined || updateData.currency !== undefined) {
      const { data: current } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid, currency, status, paid_at')
        .eq('id', id)
        .single()
      if (!current) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }
      if (updateData.total_amount !== undefined) {
        const total = Number(updateData.total_amount)
        if (updateData.total_amount === null || updateData.total_amount === '' || !Number.isFinite(total) || total <= 0) {
          return NextResponse.json({ error: 'The total must be a positive amount' }, { status: 400 })
        }
      }
      const currency = updateData.currency ?? current.currency
      if (
        updateData.currency !== undefined &&
        String(updateData.currency || '').toUpperCase() !== String(current.currency || '').toUpperCase() &&
        Number(current.amount_paid || 0) > 0
      ) {
        return NextResponse.json(
          { error: 'Payments were recorded in the current currency — delete them before changing it' },
          { status: 409 }
        )
      }
      const total = updateData.total_amount ?? current.total_amount
      if (updateData.total_amount !== undefined) updateData.total_amount = roundToCurrency(Number(total), currency)
      const balance = invoiceBalance({
        total,
        paid: current.amount_paid,
        currency,
        status: updateData.status ?? current.status,
        paidAt: current.paid_at,
      })
      updateData.balance_due = balance.balance_due
      updateData.status = balance.status
      updateData.paid_at = balance.paid_at
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ Error updating invoice:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ Error in invoice PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS policies enforce tenant isolation + manager role
    const supabase = await createAuthenticatedClient()

    // First delete related payments (RLS will filter to tenant's payments only)
    // Checked, and it aborts before the invoice is removed. Unchecked, a
    // failure here left payment records attached to an invoice that no longer
    // exists — orphaned financial data, and the route reported success.
    const { error: paymentsErr } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', id)

    if (paymentsErr) {
      console.error('[invoices DELETE] invoice_payments:', paymentsErr.message)
      return NextResponse.json(
        { error: 'Failed to delete the invoice payments. The invoice was not removed.' },
        { status: 500 }
      )
    }

    // Then delete the invoice (RLS will filter to tenant's invoices only)
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Error deleting invoice:', error)
      // RLS will return a generic error if permission denied
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { error: 'Invoice not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error in invoice DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
