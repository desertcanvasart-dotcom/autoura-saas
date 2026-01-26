// app/api/invoices/[id]/payments/route.ts
// ============================================
// AUTOURA - INVOICE PAYMENTS API
// ============================================
// Manages payments for specific invoices
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// Trigger: Auto-updates invoice balance on payment
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/invoices/[id]/payments
 * List all payments for a specific invoice
 * RLS policies automatically filter by tenant_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('❌ Error fetching invoice payments:', error)
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('❌ Error in invoice payments GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/invoices/[id]/payments
 * Record a payment for an invoice
 * Requires authentication and validates invoice ownership
 * Trigger automatically updates invoice balance
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    const body = await request.json()

    // Validate required fields
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    // Verify invoice exists and belongs to this tenant (RLS filters automatically)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, balance_due, currency, tenant_id')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found or access denied' }, { status: 404 })
    }

    // Extra security check (RLS should handle this, but explicit is better)
    if (invoice.tenant_id !== tenant_id) {
      return NextResponse.json(
        { error: 'Cannot add payment to invoice from another tenant' },
        { status: 403 }
      )
    }

    // Check if payment exceeds balance (allow small overpayment for rounding)
    if (body.amount > Number(invoice.balance_due) + 0.01) {
      return NextResponse.json(
        { error: `Payment amount exceeds balance due (${invoice.balance_due})` },
        { status: 400 }
      )
    }

    const newPayment = {
      tenant_id, // ✅ Explicit tenant_id (also auto-populated by trigger)
      invoice_id: id,
      amount: body.amount,
      currency: body.currency || invoice.currency || 'EUR',
      payment_method: body.payment_method || 'bank_transfer',
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      transaction_reference: body.transaction_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('invoice_payments')
      .insert([newPayment])
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating payment:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    // Note: The trigger function will automatically update the invoice's
    // amount_paid, balance_due, and status

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('❌ Error in invoice payments POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
