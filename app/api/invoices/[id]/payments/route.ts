// app/api/invoices/[id]/payments/route.ts
// ============================================
// AUTOURA - INVOICE PAYMENTS API
// ============================================
// Manages payments for specific invoices
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// Trigger: Auto-updates invoice balance on payment
// ============================================

import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { paymentCurrencyFor } from '@/lib/payment-currency'

/**
 * GET /api/invoices/[id]/payments
 * List all payments for a specific invoice
 * RLS policies automatically filter by tenant_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

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
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

  try {
    const { id } = await params

    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Validate required fields
    if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    // Verify invoice exists and belongs to this tenant (RLS filters automatically)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, balance_due, currency, tenant_id, status')
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

    const rawKey = request.headers.get('idempotency-key') ?? body.idempotency_key
    const idempotencyKey = typeof rawKey === 'string' && rawKey.length > 0 && rawKey.length <= 100 ? rawKey : null

    // A retry of a payment that already went through answers with it — before
    // the balance checks, which that payment itself has since satisfied (a
    // retried full payment otherwise read "exceeds balance due" for money
    // that was recorded).
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, currency, payment_method, payment_date, transaction_reference, notes, created_at')
        .eq('invoice_id', id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existing) return NextResponse.json(existing, { status: 200 })
    }

    // A cancelled invoice is owed by no one (the balance trigger then marked
    // it paid); a draft has not been sent — send it first.
    if (invoice.status === 'cancelled') {
      return NextResponse.json({ error: 'This invoice is cancelled — no payment can be recorded on it' }, { status: 409 })
    }
    if (invoice.status === 'draft') {
      return NextResponse.json({ error: 'This invoice is still a draft — mark it sent before recording a payment' }, { status: 409 })
    }

    // In the invoice's currency (lib/payment-currency): the balance trigger
    // sums amounts with no currency of their own.
    const paid = paymentCurrencyFor(body.currency, invoice.currency)
    if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: 400 })

    // Check if payment exceeds balance (allow small overpayment for rounding)
    if (Number(body.amount) > Number(invoice.balance_due) + 0.01) {
      return NextResponse.json(
        { error: `Payment amount exceeds balance due (${invoice.balance_due})` },
        { status: 400 }
      )
    }

    const newPayment = {
      tenant_id, // ✅ Explicit tenant_id (also auto-populated by trigger)
      invoice_id: id,
      amount: Number(body.amount),
      currency: paid.currency,
      payment_method: body.payment_method || 'bank_transfer',
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      transaction_reference: body.transaction_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
      // The same key on a retried request is refused by a unique index
      // (migration 429), so a double submit records one payment, not two.
      idempotency_key: idempotencyKey,
    }

    const { data, error } = await supabase
      .from('invoice_payments')
      .insert([newPayment])
      .select()
      .single()

    if (error) {
      // Already recorded under this key: answer with that payment.
      if (error.code === '23505' && idempotencyKey) {
        const { data: existing } = await supabase
          .from('invoice_payments')
          .select('id, invoice_id, amount, currency, payment_method, payment_date, transaction_reference, notes, created_at')
          .eq('invoice_id', id)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle()
        if (existing) return NextResponse.json(existing, { status: 200 })
      }
      // The database re-checked the balance under a lock (migration 429): a
      // payment saved a moment earlier left less to pay than the page showed.
      if (error.code === '23514') {
        return NextResponse.json({ error: 'Payment amount exceeds the balance due — another payment was just recorded. Refresh and try again.' }, { status: 409 })
      }
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
