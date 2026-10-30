import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { isSourcing } from '@/lib/supplier-network'

// ============================================
// The agency's supplier sourcing (Phase 3, migration 453; decision §7)
// ============================================
// GET → own · network · both. POST { sourcing } — owners and admins only.
// Changing it never rewrites the past: suppliers already on the book stay.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { data } = await supabase.from('tenants').select('supplier_sourcing').eq('id', tenant_id).maybeSingle()
  return NextResponse.json({ success: true, data: { sourcing: (data?.supplier_sourcing as string | null) ?? 'own' } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!isSourcing(body.sourcing)) return NextResponse.json({ success: false, error: 'Choose own, network or both' }, { status: 400 })
  const { error } = await supabase.from('tenants').update({ supplier_sourcing: body.sourcing }).eq('id', tenant_id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { sourcing: body.sourcing } })
}
