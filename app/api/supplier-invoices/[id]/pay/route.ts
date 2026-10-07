// POST /api/supplier-invoices/[id]/pay — requires approved status
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

async function payMatchedExpenses(
  supabase: SupabaseClient,
  invoiceId: string,
  payment: { payment_date: string; payment_method: string | null; payment_reference: string | null },
): Promise<number> {
  const { data: links, error: linkErr } = await supabase
    .from('supplier_invoice_expenses')
    .select('expense_id')
    .eq('supplier_invoice_id', invoiceId)
  if (linkErr) {
    console.error('[supplier-invoices/pay] matched expenses:', linkErr.message)
    return 0
  }
  const ids = (links || []).map((l: { expense_id: string }) => l.expense_id)
  if (ids.length === 0) return 0

  const { data: paid, error } = await supabase
    .from('expenses')
    .update({ status: 'paid', ...payment, updated_at: new Date().toISOString() })
    .in('id', ids)
    .in('status', ['pending', 'approved'])
    .select('id')
  if (error) {
    console.error('[supplier-invoices/pay] marking expenses paid:', error.message)
    return 0
  }
  return paid?.length ?? 0
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase } = auth
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Conditional UPDATE: the .eq('status', 'approved') runs at the DB level
    // alongside the WHERE on id, so two concurrent pay calls can't both
    // succeed. The prior code did SELECT-then-UPDATE which let two requests
    // both pass the read-side check and both write paid_at, with the second
    // overwriting the first.
    const { data, error: uErr } = await supabase
      .from('supplier_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        payment_reference: body.payment_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'approved')
      .select()
      .maybeSingle()
    if (uErr) return NextResponse.json({ success: false, error: 'Failed to mark paid' }, { status: 500 })

    if (!data) {
      // Distinguish "not found" from "wrong state" so the caller knows
      // whether to retry, refresh, or surface an error.
      const { data: probe } = await supabase
        .from('supplier_invoices')
        .select('status')
        .eq('id', id)
        .maybeSingle()
      if (!probe) {
        return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
      }
      return NextResponse.json(
        { success: false, error: `Invoice must be approved before it can be paid. Current status: ${probe.status}` },
        { status: 409 }
      )
    }

    // The invoice is the supplier's bill; the matched expenses are the costs
    // it covers, and every report (Payables, P&L, cash flow) reads expenses.
    // Paying only the invoice left those costs pending — still "owed" in
    // Payables, never counted as money out — so they are paid with it.
    // Only pending/approved ones: a rejected expense stays rejected, and one
    // already paid keeps its own payment details.
    const expensesPaid = await payMatchedExpenses(supabase, id, {
      payment_date: (data.paid_at as string).slice(0, 10),
      payment_method: data.payment_method ?? null,
      payment_reference: data.payment_reference || (data.supplier_invoice_number ? `Supplier invoice ${data.supplier_invoice_number}` : null),
    })

    return NextResponse.json({ success: true, data, expenses_paid: expensesPaid })
  } catch (e: any) {
    console.error('pay error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
