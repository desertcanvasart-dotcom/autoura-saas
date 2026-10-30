import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { checkDayOff, cleanNote } from '@/lib/supplier-days-off'

// ============================================
// A supplier's days off, from the office (lib/supplier-days-off, 449)
// ============================================
// GET → today onwards; POST { day, note? } marks one for them; DELETE { day }
// removes any (the office may clear a day the supplier marked).

type Ctx = { params: Promise<{ id: string }> }
const today = () => new Date().toISOString().slice(0, 10)

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('supplier_unavailable_days').select('day, note, marked_by')
    .eq('tenant_id', tenant_id).eq('supplier_id', id).gte('day', today()).order('day').limit(200)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const checked = checkDayOff(body.day, today())
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
  const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
  if (!supplier) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
  const { error } = await supabase.from('supplier_unavailable_days').upsert(
    { tenant_id, supplier_id: id, day: checked.day, note: cleanNote(body.note), marked_by: 'office' },
    { onConflict: 'tenant_id,supplier_id,day', ignoreDuplicates: true },
  )
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (typeof body.day !== 'string') return NextResponse.json({ success: false, error: 'Choose a date' }, { status: 400 })
  const { error } = await supabase.from('supplier_unavailable_days').delete().eq('tenant_id', tenant_id).eq('supplier_id', id).eq('day', body.day)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
