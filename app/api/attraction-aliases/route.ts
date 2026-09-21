// ============================================
// /api/attraction-aliases — the agency's own attraction names
// ============================================
// GET  — the agency's aliases (each with whether it still lands on a fee), its
//        fee names for the picker, and every wording in its tours that reaches
//        no fee. One call feeds the whole Settings screen.
// POST — add an alias { alias, canonical }.
//
// Reads are for any signed-in user; writes are owner/admin, like the
// vocabulary. RLS scopes every table here to the caller's tenant, and the
// tenant is never taken from the request.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { aliasHealth, unresolvedWordings, validateAlias, type FeeName, type StoredAlias, type TourForScan } from '@/lib/pricing/alias-admin'
import { ALIAS_COLS, ALIAS_WRITE_ROLES, ALIAS_WRITE_DENIED } from '@/lib/pricing/alias-admin-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const [aliasRes, feeRes, tourRes] = await Promise.all([
      supabase.from('attraction_aliases').select(ALIAS_COLS).eq('tenant_id', tenant_id).order('alias'),
      supabase.from('entrance_fees').select('attraction_name, city').eq('tenant_id', tenant_id).eq('is_active', true).order('attraction_name'),
      supabase.from('tour_templates').select('template_name, itinerary, main_attractions').eq('tenant_id', tenant_id).eq('is_active', true),
    ])
    if (aliasRes.error) throw aliasRes.error
    if (feeRes.error) throw feeRes.error
    if (tourRes.error) throw tourRes.error

    const fees = (feeRes.data ?? []) as FeeName[]
    const rows = aliasRes.data ?? []
    const aliases = rows.map(a => ({ ...a, health: aliasHealth(a.canonical, fees) }))
    // Only the ACTIVE aliases rewrite anything, exactly as the engine reads them.
    const unresolved = unresolvedWordings((tourRes.data ?? []) as TourForScan[], rows.filter(a => a.is_active), fees)

    return NextResponse.json({
      success: true,
      data: { aliases, fees, unresolved, canWrite: ALIAS_WRITE_ROLES.includes(role || '') },
    })
  } catch (error) {
    console.error('GET attraction-aliases error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load your attraction names' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!ALIAS_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: ALIAS_WRITE_DENIED }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const [{ data: fees }, { data: existing }] = await Promise.all([
      supabase.from('entrance_fees').select('attraction_name, city').eq('tenant_id', tenant_id).eq('is_active', true),
      supabase.from('attraction_aliases').select('id, alias, canonical, is_active').eq('tenant_id', tenant_id),
    ])
    const verdict = validateAlias(body, (fees ?? []) as FeeName[], (existing ?? []) as StoredAlias[])
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    const { data, error } = await supabase
      .from('attraction_aliases')
      // The tenant is the caller's own — never the request's.
      .insert({ tenant_id, alias: verdict.alias, canonical: verdict.canonical })
      .select(ALIAS_COLS)
      .single()
    if (error) {
      // The unique index is the last word if two people add the same wording at once.
      if (error.code === '23505') return NextResponse.json({ success: false, error: `"${verdict.alias}" already has an alias. Edit that one instead.` }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data, ...(verdict.note ? { note: verdict.note } : {}) }, { status: 201 })
  } catch (error) {
    console.error('POST attraction-aliases error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the alias' }, { status: 500 })
  }
}
