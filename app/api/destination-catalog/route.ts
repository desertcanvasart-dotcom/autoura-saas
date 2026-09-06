import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { shapeCatalog } from '@/lib/destination-catalog'

// ============================================
// GET — the destination catalog, through this tenant's eyes
// ============================================
// The vocabulary behind every city dropdown (P1 of
// docs/plans/productization-from-reference.md): the GLOBAL catalog of
// countries and cities, annotated with which ones THIS tenant operates.
// RLS does the scoping — catalog tables read for any signed-in user,
// tenant_destinations only for the caller's own tenant.
//
// Until migration 294 is applied this returns success with an empty list and
// the client hook serves the built-in Egypt vocabulary — deploy and migration
// land in either order.

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const [{ data: catalog, error: catalogError }, { data: selections }] = await Promise.all([
      supabase
        .from('destination_catalog')
        .select('id, country_code, name, name_ja, is_active, destination_cities(id, name, name_ja, aliases, lat, lng, airport_codes, timezone, sort_order, is_active)')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('tenant_destinations')
        .select('catalog_id, is_default, generation_brief, glossary, is_active, city_ids')
        .eq('is_active', true),
    ])

    if (catalogError) {
      // Table absent = migration 294 not applied yet. Empty, not a 500 —
      // dropdowns have a fallback and the page must keep working.
      console.error('destination-catalog fetch error:', catalogError)
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({
      success: true,
      data: shapeCatalog(catalog ?? [], selections ?? []),
    })
  } catch (error) {
    console.error('destination-catalog error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load destinations' }, { status: 500 })
  }
}
