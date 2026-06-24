// POST /api/supplier-invoices/[id]/approve — requires fully matched (or override)
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, user } = auth
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const override = body.override === true

    // Conditional UPDATE: combine the WHERE on id with the state precondition
    // (.neq paid / cancelled / approved) and, unless override is set, the
    // match_status='matched' check. The prior SELECT-then-UPDATE pattern let
    // two concurrent approve calls both pass the read-side check and both
    // write an approved_at, with the second silently overwriting the first.
    // Also: the prior code permitted re-approving an already-approved invoice
    // (no .neq('status','approved') guard); the conditional UPDATE here rules
    // that out too.
    let updateBuilder = supabase
      .from('supplier_invoices')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'approved')

    if (!override) {
      updateBuilder = updateBuilder.eq('match_status', 'matched')
    }

    const { data, error: uErr } = await updateBuilder.select().maybeSingle()
    if (uErr) return NextResponse.json({ success: false, error: 'Failed to approve' }, { status: 500 })

    if (!data) {
      // Probe to give the caller a specific reason rather than a vague 409.
      const { data: probe } = await supabase
        .from('supplier_invoices')
        .select('status, match_status')
        .eq('id', id)
        .maybeSingle()
      if (!probe) {
        return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
      }
      if (probe.status === 'paid' || probe.status === 'cancelled' || probe.status === 'approved') {
        return NextResponse.json(
          { success: false, error: `Cannot approve invoice with status: ${probe.status}` },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { success: false, error: 'Invoice must be fully matched before approval. Pass override: true to approve with a discrepancy.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('approve error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
