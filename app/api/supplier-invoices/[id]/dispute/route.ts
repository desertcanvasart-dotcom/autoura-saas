// POST /api/supplier-invoices/[id]/dispute
import { gateRole } from '@/lib/api-role-gate'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { recomputeMatch } from '@/lib/supplier-invoices/recompute-match'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const body = await request.json().catch(() => ({}))
    const reason: string = body.reason || 'Disputed'
    const action: string = body.action || 'dispute'

    // Three moves, each only from the states it makes sense from:
    //  dispute — a bill not yet paid (disputing a PAID bill reopened it,
    //            and it could be approved and paid a second time);
    //  resolve — a disputed bill back to received, to match and approve it
    //            (a disputed bill could get stuck for good);
    //  cancel  — any bill not yet paid.
    const moves: Record<string, { from: string[]; set: Record<string, unknown> }> = {
      dispute: { from: ['received', 'matched', 'approved'], set: { status: 'disputed', discrepancy_notes: reason } },
      resolve: { from: ['disputed'], set: { status: 'received' } },
      cancel: { from: ['received', 'matched', 'approved', 'disputed'], set: { status: 'cancelled' } },
    }
    const move = moves[action]
    if (!move) return NextResponse.json({ success: false, error: 'action must be dispute, resolve or cancel' }, { status: 400 })

    const { data, error } = await supabase
      .from('supplier_invoices')
      .update({ ...move.set, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', move.from)
      .select().maybeSingle()
    if (error) return NextResponse.json({ success: false, error: `Failed to ${action}` }, { status: 500 })
    if (!data) {
      const { data: probe } = await supabase.from('supplier_invoices').select('status').eq('id', id).maybeSingle()
      if (!probe) return NextResponse.json({ success: false, error: 'Supplier invoice not found' }, { status: 404 })
      return NextResponse.json({ success: false, error: `A ${probe.status} invoice cannot be ${action === 'dispute' ? 'disputed' : action === 'resolve' ? 'resolved' : 'cancelled'}` }, { status: 409 })
    }
    // Resolving re-derives the match from the linked expenses.
    if (action === 'resolve') await recomputeMatch(supabase, id)

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    console.error('dispute error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
