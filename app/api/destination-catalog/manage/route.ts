import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// ============================================
// POST — destination configuration (action-keyed)
// ============================================
// P1b of docs/plans/productization-from-reference.md. The catalog tables are
// GLOBAL and service-role-write by design (migration 294), and
// tenant_destinations is read-only to authenticated — so every write comes
// through here: owner/admin gate, then the admin client with the caller's
// tenant stamped explicitly. Self-serve model: a tenant can add countries
// and cities to the shared catalog (additive, benign — every tenant picks
// which countries it actually operates), but nothing here can update or
// delete a GLOBAL city another tenant may be using; that stays operator-side
// until there is super-admin tooling.
//
// Actions:
//   select_destination   { catalog_id }
//   deselect_destination { catalog_id }   — refuses the default
//   set_default          { catalog_id }   — must be selected
//   update_destination   { catalog_id, generation_brief?, glossary? }
//   add_country          { country_code, name, name_ja? } — auto-selects
//   add_city             { catalog_id, name, name_ja?, aliases? }
//                        — warns on same-name city in another country;
//                          joins the tenant's focus when one is set
//   set_cities           { catalog_id, city_ids: uuid[] | null }
//                        — the tenant's FOCUS within a destination (336):
//                          null = every city; selects the destination if needed

const ADMIN_ROLES = ['owner', 'admin']

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { tenant_id, role } = authResult
    if (!tenant_id || !ADMIN_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const action = body?.action as string

    const admin = createAdminClient()

    switch (action) {
      case 'select_destination': {
        const catalogId = body.catalog_id as string
        if (!catalogId) return badRequest('catalog_id is required')

        // First selection becomes the default automatically.
        const { count } = await admin
          .from('tenant_destinations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)

        const { error } = await admin
          .from('tenant_destinations')
          .upsert(
            { tenant_id, catalog_id: catalogId, is_active: true, is_default: (count ?? 0) === 0 },
            { onConflict: 'tenant_id,catalog_id' }
          )
        if (error) return dbError(error)
        return NextResponse.json({ success: true })
      }

      case 'deselect_destination': {
        const catalogId = body.catalog_id as string
        if (!catalogId) return badRequest('catalog_id is required')

        const { data: row } = await admin
          .from('tenant_destinations')
          .select('id, is_default')
          .eq('tenant_id', tenant_id)
          .eq('catalog_id', catalogId)
          .maybeSingle()
        if (!row) return badRequest('Destination is not selected')
        if (row.is_default) {
          return badRequest('Set another destination as default first')
        }

        const { error } = await admin
          .from('tenant_destinations')
          .update({ is_active: false })
          .eq('id', row.id)
        if (error) return dbError(error)
        return NextResponse.json({ success: true })
      }

      case 'set_default': {
        const catalogId = body.catalog_id as string
        if (!catalogId) return badRequest('catalog_id is required')

        const { data: row } = await admin
          .from('tenant_destinations')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('catalog_id', catalogId)
          .eq('is_active', true)
          .maybeSingle()
        if (!row) return badRequest('Select the destination first')

        const { error: clearError } = await admin
          .from('tenant_destinations')
          .update({ is_default: false })
          .eq('tenant_id', tenant_id)
          .eq('is_default', true)
        if (clearError) return dbError(clearError)

        const { error } = await admin
          .from('tenant_destinations')
          .update({ is_default: true })
          .eq('id', row.id)
        if (error) return dbError(error)
        return NextResponse.json({ success: true })
      }

      case 'update_destination': {
        const catalogId = body.catalog_id as string
        if (!catalogId) return badRequest('catalog_id is required')

        const patch: Record<string, unknown> = {}
        if ('generation_brief' in body) patch.generation_brief = body.generation_brief || null
        if ('glossary' in body) patch.glossary = body.glossary ?? null
        if (Object.keys(patch).length === 0) return badRequest('Nothing to update')

        const { error, count } = await admin
          .from('tenant_destinations')
          .update(patch, { count: 'exact' })
          .eq('tenant_id', tenant_id)
          .eq('catalog_id', catalogId)
        if (error) return dbError(error)
        if (!count) return badRequest('Destination is not selected')
        return NextResponse.json({ success: true })
      }

      case 'add_country': {
        const countryCode = String(body.country_code || '').trim().toUpperCase()
        const name = String(body.name || '').trim()
        if (!/^[A-Z]{2}$/.test(countryCode)) return badRequest('country_code must be a 2-letter ISO code')
        if (!name) return badRequest('name is required')

        const { data: created, error } = await admin
          .from('destination_catalog')
          .insert({ country_code: countryCode, name, name_ja: body.name_ja || null })
          .select('id')
          .single()
        if (error) {
          if (error.code === '23505') return badRequest(`${countryCode} already exists in the catalog — select it instead`)
          return dbError(error)
        }

        // The tenant that added a country obviously operates it.
        const { error: selError } = await admin
          .from('tenant_destinations')
          .upsert(
            { tenant_id, catalog_id: created.id, is_active: true, is_default: false },
            { onConflict: 'tenant_id,catalog_id' }
          )
        if (selError) return dbError(selError)
        return NextResponse.json({ success: true, data: { id: created.id } })
      }

      case 'set_cities': {
        const catalogId = body.catalog_id as string
        if (!catalogId) return badRequest('catalog_id is required')
        const raw = body.city_ids
        let cityIds: string[] | null = null
        if (raw !== null && raw !== undefined) {
          if (!Array.isArray(raw)) return badRequest('city_ids must be an array of ids, or null for every city')
          // Only ids that belong to THIS destination survive.
          const { data: known } = await admin.from('destination_cities').select('id').eq('catalog_id', catalogId)
          const ok = new Set((known ?? []).map(c => c.id))
          cityIds = raw.map(String).filter(id => ok.has(id))
          if (cityIds.length === 0) return badRequest('Keep at least one city, or choose every city')
        }
        const { error } = await admin
          .from('tenant_destinations')
          .upsert({ tenant_id, catalog_id: catalogId, is_active: true, city_ids: cityIds }, { onConflict: 'tenant_id,catalog_id' })
        if (error) return dbError(error)
        return NextResponse.json({ success: true })
      }

      case 'add_city': {
        const catalogId = body.catalog_id as string
        const name = String(body.name || '').trim()
        if (!catalogId) return badRequest('catalog_id is required')
        if (!name) return badRequest('name is required')

        // Same-name city in ANOTHER country: allowed (Alexandria exists twice
        // on Earth) but flagged, so vocabulary collisions in the AI parser
        // are a known thing, not a surprise.
        const { data: collisions } = await admin
          .from('destination_cities')
          .select('id, catalog_id, destination_catalog(name)')
          .ilike('name', name)
          .neq('catalog_id', catalogId)

        const { data: maxRow } = await admin
          .from('destination_cities')
          .select('sort_order')
          .eq('catalog_id', catalogId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: created, error } = await admin
          .from('destination_cities')
          .insert({
            catalog_id: catalogId,
            name,
            name_ja: body.name_ja || null,
            // aliases and airport_codes are NOT NULL with a '{}' default. A
            // default only applies when a column is OMITTED -- passing null
            // explicitly is a not-null violation, so a city with no aliases
            // could not be created. Empty arrays, not null.
            aliases: Array.isArray(body.aliases) ? body.aliases : [],
            airport_codes: Array.isArray(body.airport_codes) ? body.airport_codes : [],
            sort_order: (maxRow?.sort_order ?? 0) + 1,
          })
          .select('id')
          .single()
        if (error) {
          if (error.code === '23505') return badRequest(`${name} already exists in this country`)
          return dbError(error)
        }

        // A city the agency adds itself is one it sells: when a focus is set
        // (336), the new city joins it rather than being born hidden.
        const { data: sel } = await admin
          .from('tenant_destinations')
          .select('city_ids')
          .eq('tenant_id', tenant_id)
          .eq('catalog_id', catalogId)
          .maybeSingle()
        if (sel?.city_ids) {
          await admin
            .from('tenant_destinations')
            .update({ city_ids: [...sel.city_ids, created.id] })
            .eq('tenant_id', tenant_id)
            .eq('catalog_id', catalogId)
        }

        const warning = collisions?.length
          ? `A city named "${name}" also exists in ${collisions
              .map(c => (c.destination_catalog as { name: string } | null)?.name)
              .filter(Boolean)
              .join(', ')} — itinerary text mentioning it may need the country spelled out`
          : null
        return NextResponse.json({ success: true, data: { id: created.id }, warning })
      }

      default:
        return badRequest(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('destination-catalog manage error:', error)
    return NextResponse.json({ success: false, error: 'Request failed' }, { status: 500 })
  }
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

function dbError(error: { message: string }) {
  console.error('destination-catalog manage db error:', error)
  return NextResponse.json({ success: false, error: error.message }, { status: 500 })
}
