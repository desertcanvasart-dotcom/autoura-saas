// ============================================
// /api/settings/zones — the agency's zones, city by city
// ============================================
// GET  — every zone (any signed-in user: the hotel and transport forms will
//        read them) and whether the caller may change them.
// POST — add a zone { city, label, is_default? }. The first zone of a city
//        becomes its default.
//
// Writes are owner/admin. RLS scopes the table to the caller's tenant, and the
// tenant is never taken from the request. Migration 469,
// docs/transport-zones/PLAN.md step 1.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { ZONE_COLS, ZONE_WRITE_DENIED, ZONE_WRITE_ROLES, uniqueZoneKey, validateZone, zonesOfCity } from '@/lib/rates/city-zones'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { data, error } = await supabase.from('city_zones').select(ZONE_COLS).eq('tenant_id', tenant_id).order('city').order('rank')
    if (error) throw error
    return NextResponse.json({ success: true, data: { zones: data ?? [], canWrite: ZONE_WRITE_ROLES.includes(role || '') } })
  } catch (error) {
    console.error('GET zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load your zones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!ZONE_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: ZONE_WRITE_DENIED }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const { data: existing, error: readError } = await supabase.from('city_zones').select('id, city, key, label, is_default, rank').eq('tenant_id', tenant_id)
    if (readError) throw readError
    const all = existing ?? []
    const verdict = validateZone(body, all)
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    const siblings = zonesOfCity(all, verdict.city)
    // The first zone of a city is its default; asking for the default moves it.
    const makeDefault = siblings.length === 0 || body.is_default === true
    if (makeDefault && siblings.some(z => z.is_default)) {
      const { error } = await supabase.from('city_zones').update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenant_id).in('id', siblings.filter(z => z.is_default).map(z => z.id))
      if (error) throw error
    }

    const { data, error } = await supabase
      .from('city_zones')
      .insert({
        tenant_id,
        // A city already listed keeps its first spelling, so one city never shows twice.
        city: siblings[0]?.city ?? verdict.city,
        key: uniqueZoneKey(verdict.label, siblings.map(z => z.key)),
        label: verdict.label,
        is_default: makeDefault,
        rank: siblings.reduce((m, z) => Math.max(m, z.rank), 0) + 1,
      })
      .select(ZONE_COLS)
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: 'Someone added the same zone at the same moment. Reload the page.' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the zone' }, { status: 500 })
  }
}
