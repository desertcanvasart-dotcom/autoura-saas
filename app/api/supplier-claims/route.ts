import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// ============================================
// Suppliers asking to sign in as this agency's supplier (Phase 2B, 450)
// ============================================
// GET ?status=pending | ?supplier_id=… → this agency's claims, with the
// supplier's name and the phone they signed in with. The claims are read
// through RLS (this agency's only); the phone lives on supplier_accounts,
// which no signed-in user can read, so it is fetched with the service role
// for exactly those claims' accounts.

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')
  const supplierId = request.nextUrl.searchParams.get('supplier_id')
  let q = supabase.from('supplier_account_links').select('id, account_id, supplier_id, status, requested_at, decided_at')
    .eq('tenant_id', tenant_id).order('requested_at', { ascending: false }).limit(200)
  if (status && ['pending', 'approved', 'rejected'].includes(status)) q = q.eq('status', status)
  if (supplierId) q = q.eq('supplier_id', supplierId)
  const { data: claims, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!claims || claims.length === 0) return NextResponse.json({ success: true, data: [] })

  const admin = createAdminClient() as unknown as SupabaseClient
  const [{ data: accounts }, { data: suppliers }] = await Promise.all([
    admin.from('supplier_accounts').select('id, phone, last_login_at').in('id', [...new Set(claims.map(c => c.account_id as string))]),
    supabase.from('suppliers').select('id, name, company_name').in('id', [...new Set(claims.map(c => c.supplier_id as string))]).eq('tenant_id', tenant_id),
  ])
  return NextResponse.json({
    success: true,
    data: claims.map(c => {
      const acc = (accounts ?? []).find(a => a.id === c.account_id)
      const sup = (suppliers ?? []).find(s => s.id === c.supplier_id)
      return {
        id: c.id, supplier_id: c.supplier_id, status: c.status, requested_at: c.requested_at, decided_at: c.decided_at,
        supplier_name: ((sup?.name || sup?.company_name) as string | null) ?? 'Supplier',
        phone: acc?.phone ? `+${acc.phone}` : null,
        last_login_at: acc?.last_login_at ?? null,
      }
    }),
  })
}
