// POST   /api/supplier-invoices/[id]/match — link expenses, recompute match
// DELETE /api/supplier-invoices/[id]/match — unlink an expense, recompute
import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { isMatchable, otherCurrency } from '@/lib/supplier-invoices/match-state'
import { recomputeMatch } from '@/lib/supplier-invoices/recompute-match'

const notMatchable = (status: string | null, verb: string) =>
  NextResponse.json({ success: false, error: `Cannot ${verb} an invoice with status '${status}'` }, { status: 409 })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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

    const { data: expenses } = await supabase.from('expenses').select('id, amount, currency, status, expense_number').in('id', expenseIds)

    // A cost belongs to one bill, and only an unpaid one can be matched: the
    // same expense linked to two bills made both read "matched", and a paid
    // or rejected one could be linked at all.
    const settled = (expenses || []).filter((e: { status?: string | null }) => e.status !== 'pending' && e.status !== 'approved')
    if (settled.length) {
      return NextResponse.json({ success: false, error: `Only pending or approved expenses can be matched (${settled.map((e: { expense_number?: string | null }) => e.expense_number).join(', ')})` }, { status: 400 })
    }
    const { data: elsewhere } = await supabase
      .from('supplier_invoice_expenses')
      .select('expense_id')
      .in('expense_id', expenseIds)
      .neq('supplier_invoice_id', id)
    if (elsewhere && elsewhere.length) {
      return NextResponse.json({ success: false, error: 'Some of these expenses are already matched to another supplier invoice', details: { expense_ids: elsewhere.map((l: { expense_id: string }) => l.expense_id) } }, { status: 409 })
    }
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

    const result = await recomputeMatch(supabase, id)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('match POST error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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

    const result = await recomputeMatch(supabase, id)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('match DELETE error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
