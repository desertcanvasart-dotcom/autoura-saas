import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { claimNextStatus } from '@/lib/supplier-claims'

// ============================================
// An admin decides a supplier's sign-in claim (§9: an admin approves every merge)
// ============================================
// POST { decision: 'approve' | 'reject' }. Through RLS (this agency's claims,
// writers only) and admins only here. A supplier record can be connected to
// one sign-in at a time (unique index in 450).

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const { data: claim } = await supabase.from('supplier_account_links').select('id, status')
    .eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
  if (!claim) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const next = claimNextStatus(claim.status as string, body.decision)
  if (!next.ok) return NextResponse.json({ success: false, error: next.error }, { status: 409 })

  const { data: updated, error } = await supabase.from('supplier_account_links')
    .update({ status: next.status, decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', tenant_id).eq('status', claim.status).select('id, status').maybeSingle()
  if (error) {
    const taken = /duplicate|unique/i.test(error.message)
    return NextResponse.json({ success: false, error: taken ? 'This supplier is already connected to another sign-in — disconnect that one first' : error.message }, { status: taken ? 409 : 500 })
  }
  if (!updated) return NextResponse.json({ success: false, error: 'Changed meanwhile — refresh and try again' }, { status: 409 })
  return NextResponse.json({ success: true, data: updated })
}
