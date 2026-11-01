import { NextResponse } from 'next/server'
import { requireAuth, adminDb } from '@/lib/supabase-server'
import { toConnectedProfile } from '@/lib/supplier-network-connected'

// ============================================
// What this agency's connected suppliers say about themselves (2026-11-01)
// ============================================
// GET → { [supplier_id]: profile } for every supplier of THIS agency that a
// supplier account is connected to: an approved sign-in claim
// (supplier_account_links) or a copy added from the network
// (suppliers.network_account_id). Both are read through RLS, so only this
// agency's own. The profiles themselves are readable to signed-in users only
// once verified and listed, so they are fetched with the service role for
// exactly those accounts — and cut down to what the supplier wrote for
// agencies (toConnectedProfile): never a phone, papers or the review note.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const [{ data: links, error: linkError }, { data: copies, error: copyError }] = await Promise.all([
    supabase.from('supplier_account_links').select('supplier_id, account_id')
      .eq('tenant_id', tenant_id).eq('status', 'approved').limit(1000),
    supabase.from('suppliers').select('id, network_account_id')
      .eq('tenant_id', tenant_id).not('network_account_id', 'is', null).limit(1000),
  ])
  if (linkError || copyError) {
    return NextResponse.json({ success: false, error: (linkError ?? copyError)!.message }, { status: 500 })
  }

  const accountOf = new Map<string, string>()
  for (const c of copies ?? []) accountOf.set(c.id as string, c.network_account_id as string)
  for (const l of links ?? []) accountOf.set(l.supplier_id as string, l.account_id as string)
  if (accountOf.size === 0) return NextResponse.json({ success: true, data: {} })

  const { data: profiles, error } = await adminDb().from('supplier_network_profiles')
    .select('account_id, display_name, kinds, cities, languages, about, listed, verification_status')
    .in('account_id', [...new Set(accountOf.values())])
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const byAccount = new Map((profiles ?? []).map(p => [p.account_id as string, p]))
  const data: Record<string, ReturnType<typeof toConnectedProfile>> = {}
  for (const [supplierId, accountId] of accountOf) {
    const p = byAccount.get(accountId)
    if (p) data[supplierId] = toConnectedProfile(p)
  }
  return NextResponse.json({ success: true, data })
}
