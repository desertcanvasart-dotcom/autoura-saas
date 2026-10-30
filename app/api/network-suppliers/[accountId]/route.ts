import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { NETWORK_KINDS, copyTypes, usesNetwork } from '@/lib/supplier-network'

// ============================================
// Add a network supplier to this agency's own book (Phase 3)
// ============================================
// POST → an ordinary supplier on THIS agency's book (suppliers.network_account_id),
// already connected to the supplier's sign-in (an approved claim), so the
// usual requests, the supplier's inbox and answers work at once. The agency's
// rates and notes on this copy are its own — nothing is shared back. Prices
// are agreed per request (decision §7). Managers and above.

export async function POST(_request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { accountId } = await params

  const { data: tenant } = await supabase.from('tenants').select('supplier_sourcing').eq('id', tenant_id).maybeSingle()
  if (!usesNetwork(tenant?.supplier_sourcing as string | null)) {
    return NextResponse.json({ success: false, error: 'Turn the network on in Settings → Company first' }, { status: 403 })
  }
  // Read through row security: only a listed, verified profile is visible.
  const { data: profile } = await supabase.from('supplier_network_profiles')
    .select('account_id, display_name, kinds, cities, languages').eq('account_id', accountId).maybeSingle()
  if (!profile) return NextResponse.json({ success: false, error: 'This supplier is not in the network' }, { status: 404 })

  // Already on this list — added from the network, or connected by their own sign-in.
  const [{ data: existing }, { data: connected }] = await Promise.all([
    supabase.from('suppliers').select('id').eq('tenant_id', tenant_id).eq('network_account_id', accountId).maybeSingle(),
    supabase.from('supplier_account_links').select('supplier_id').eq('tenant_id', tenant_id).eq('account_id', accountId).eq('status', 'approved').limit(1).maybeSingle(),
  ])
  const have = (existing?.id ?? connected?.supplier_id) as string | undefined
  if (have) return NextResponse.json({ success: true, data: { supplier_id: have, already: true } })

  const { data: vocab } = await supabase.from('tenant_vocabularies').select('key').eq('tenant_id', tenant_id).eq('kind', 'supplier_type')
  const types = copyTypes(profile.kinds as string[], (vocab ?? []).map(v => v.key as string))
  if (types.length === 0) {
    const words = (profile.kinds as string[]).map(k => NETWORK_KINDS[k] ?? k).join(', ')
    return NextResponse.json({ success: false, error: `None of this supplier's kinds (${words}) is in your vocabulary — add one under Settings → Your vocabulary` }, { status: 409 })
  }

  // The phone they signed in with (accounts are invisible to signed-in users).
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: account } = await admin.from('supplier_accounts').select('phone, disabled_at').eq('id', accountId).maybeSingle()
  if (!account || account.disabled_at) return NextResponse.json({ success: false, error: 'This supplier is not available' }, { status: 404 })
  const phone = `+${account.phone}`

  const { data: created, error } = await supabase.from('suppliers').insert({
    tenant_id,
    name: profile.display_name,
    company_name: profile.display_name,
    types,
    type: types[0],
    supplier_type: types[0],
    city: (profile.cities as string[])[0] ?? null,
    whatsapp: phone,
    contact_phone: phone,
    languages: (profile.languages as string[]).length ? profile.languages : null,
    status: 'active',
    is_active: true,
    network_account_id: accountId,
    notes: 'Added from the Autoura network. Prices are agreed per request.',
  }).select('id').single()
  if (error || !created) {
    const dup = error && /duplicate|unique/i.test(error.message)
    return NextResponse.json({ success: false, error: dup ? 'Already on your list' : (error?.message ?? 'Could not add') }, { status: dup ? 409 : 500 })
  }

  // Connected at once: the agency chose a verified supplier (no claim to approve).
  const { error: linkError } = await admin.from('supplier_account_links').upsert({
    account_id: accountId, tenant_id, supplier_id: created.id, status: 'approved', decided_by: user?.id ?? null, decided_at: new Date().toISOString(),
  }, { onConflict: 'account_id,supplier_id' })
  if (linkError) console.error('[network add] link:', linkError.message)
  return NextResponse.json({ success: true, data: { supplier_id: created.id } })
}
