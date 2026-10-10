// POST   /api/supplier-invoices/[id]/match — link expenses, recompute match
// DELETE /api/supplier-invoices/[id]/match — unlink an expense, recompute
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MATCHABLE, isMatchable, matchState, otherCurrency } from '@/lib/supplier-invoices/match-state'

async function recompute(supabase: SupabaseClient, id: string) {
  const { data: invoice } = await supabase.from('supplier_invoices').select('amount').eq('id', id).single()
  const { data: matches } = await supabase.from('supplier_invoice_expenses').select('matched_amount').eq('supplier_invoice_id', id)
  const state = matchState(invoice?.amount, (matches || []).map((m: { matched_amount: unknown }) => m.matched_amount))
  // Guarded on the status too: a bill approved or disputed meanwhile keeps it.
  await supabase.from('supplier_invoices').update({
    ...state,
    updated_at: new Date().toISOString(),
  }).eq('id', id).in('status', MATCHABLE)

  return { matched_amount: state.matched_amount, discrepancy_amount: state.discrepancy_amount, match_status: state.match_status }
}

const notMatchable = (status: string | null, verb: string) =>
  NextResponse.json({ success: false, error: `Cannot ${verb} an invoice with status '${status}'` }, { status: 409 })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth
    const { id } = await params
    const { expenseIds } = await request.json()

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return NextResponse.json({ success: false, error: 'expenseIds array is required' }, { status: 400 })
    }

    const { data: invoice } = await supabase.from('supplier_invoices').select('id, status, currency').eq('id', id).single()
    if (!invoice) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
    if (!isMatchable(invoice.status)) return notMatchable(invoice.status, 'match')

    const { data: expenses } = await supabase.from('expenses').select('id, amount, currency').in('id', expenseIds)
    const foreign = otherCurrency(invoice.currency, expenses || [])
    if (foreign.length) {
      return NextResponse.json({
        success: false,
        error: `Expenses must be in the invoice currency (${String(invoice.currency || 'EUR').toUpperCase()})`,
        details: { expense_ids: foreign },
      }, { status: 400 })
    }
    const links = (expenses || []).map((exp: any) => ({
      tenant_id, supplier_invoice_id: id, expense_id: exp.id, matched_amount: exp.amount,
    }))
    if (links.length) {
      const { error } = await supabase.from('supplier_invoice_expenses').upsert(links, { onConflict: 'supplier_invoice_id,expense_id' })
      if (error) return NextResponse.json({ success: false, error: 'Failed to link expenses' }, { status: 500 })
    }

    const result = await recompute(supabase, id)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('match POST error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase } = auth
    const { id } = await params
    const { expenseId } = await request.json()
    if (!expenseId) return NextResponse.json({ success: false, error: 'expenseId is required' }, { status: 400 })

    const { data: invoice } = await supabase.from('supplier_invoices').select('id, status').eq('id', id).maybeSingle()
    if (!invoice) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
    if (!isMatchable(invoice.status)) return notMatchable(invoice.status, 'unmatch')

    // Checked: unchecked, a failed unmatch still ran recompute and returned
    // success, so the caller was told the expense was detached while it was
    // still attached — and the recomputed totals were derived from the stale
    // link.
    const { error: unmatchErr } = await supabase
      .from('supplier_invoice_expenses')
      .delete()
      .eq('supplier_invoice_id', id)
      .eq('expense_id', expenseId)

    if (unmatchErr) {
      console.error('[supplier-invoices/match DELETE]', unmatchErr.message)
      return NextResponse.json({ success: false, error: 'Failed to unmatch the expense' }, { status: 500 })
    }

    const result = await recompute(supabase, id)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('match DELETE error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
