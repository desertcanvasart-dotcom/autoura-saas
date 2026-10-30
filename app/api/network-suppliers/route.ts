import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { matchesSearch, toPublicProfile, usesNetwork } from '@/lib/supplier-network'

// ============================================
// Search the shared supplier network (Phase 3)
// ============================================
// GET ?kind=&city=&language=&q= → verified, listed profiles (row security
// lets a signed-in user read nothing else) — never a phone, email or price —
// marked when this agency already has them on its book. Only for agencies
// whose sourcing is network or both.

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const { data: tenant } = await supabase.from('tenants').select('supplier_sourcing').eq('id', tenant_id).maybeSingle()
  if (!usesNetwork(tenant?.supplier_sourcing as string | null)) {
    return NextResponse.json({ success: false, error: 'Your agency uses its own suppliers only — an admin can turn the network on in Settings → Company.', network_off: true }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const { data, error } = await supabase.from('supplier_network_profiles')
    .select('account_id, display_name, kinds, cities, languages, about')
    .eq('listed', true).eq('verification_status', 'verified').order('display_name').limit(500)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const q = { kind: sp.get('kind'), city: sp.get('city'), language: sp.get('language'), text: sp.get('q') }
  const found = (data ?? []).map(toPublicProfile).filter(p => matchesSearch(p, q))

  const ids = found.map(p => p.account_id)
  const { data: mine } = ids.length
    ? await supabase.from('suppliers').select('id, network_account_id').eq('tenant_id', tenant_id).in('network_account_id', ids)
    : { data: [] }
  return NextResponse.json({
    success: true,
    data: found.map(p => ({ ...p, my_supplier_id: (mine ?? []).find(m => m.network_account_id === p.account_id)?.id ?? null })),
  })
}
