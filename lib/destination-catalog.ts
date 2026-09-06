// ============================================
// Destination catalog — the pure shaping logic
// ============================================
// Shared by the API route (server) and the dropdown hook (client), and unit
// tested in lib/__tests__/destination-catalog.test.ts. The catalog tables are
// GLOBAL (migration 294); tenant_destinations records which countries a
// tenant operates. Until that migration is applied every list is empty and
// the built-in Egypt vocabulary carries the dropdowns unchanged.

import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'

export interface CatalogCity {
  id?: string
  name: string
  name_ja?: string | null
  aliases?: string[] | null
  airport_codes?: string[] | null
  sort_order?: number
  is_active?: boolean
}

export interface CatalogDestination {
  id: string
  country_code: string
  name: string
  name_ja?: string | null
  selected: boolean
  is_default: boolean
  generation_brief?: string | null
  glossary?: unknown
  /** The cities this tenant SELLS here (its focus) — what dropdowns offer. */
  cities: CatalogCity[]
  /** Every catalog city of the destination (the settings screen picks from these). */
  all_cities: CatalogCity[]
  /** The focus as stored: null = every city. */
  city_ids: string[] | null
}

interface RawCatalogRow {
  id: string
  country_code: string
  name: string
  name_ja: string | null
  destination_cities?: CatalogCity[] | null
}

interface RawSelectionRow {
  catalog_id: string
  is_default: boolean | null
  generation_brief: string | null
  glossary: unknown
  city_ids?: string[] | null
}

/** Join the global catalog with this tenant's selections (route side). */
export function shapeCatalog(
  catalog: RawCatalogRow[],
  selections: RawSelectionRow[]
): CatalogDestination[] {
  const byId = new Map(selections.map(s => [s.catalog_id, s]))
  return catalog.map(c => {
    const sel = byId.get(c.id)
    const all_cities = (c.destination_cities ?? [])
      .filter(city => city.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const city_ids = sel?.city_ids ?? null
    return {
      id: c.id,
      country_code: c.country_code,
      name: c.name,
      name_ja: c.name_ja,
      selected: !!sel,
      is_default: sel?.is_default ?? false,
      generation_brief: sel?.generation_brief ?? null,
      glossary: sel?.glossary ?? null,
      all_cities,
      city_ids,
      cities: focusCities(all_cities, city_ids),
    }
  })
}

/** The tenant's focus applied: null = every city; an array = those cities,
 *  in catalog order. An id the catalog no longer has is ignored. */
export function focusCities(all: CatalogCity[], cityIds: string[] | null | undefined): CatalogCity[] {
  if (!cityIds) return all
  const wanted = new Set(cityIds)
  return all.filter(c => c.id && wanted.has(c.id))
}

/**
 * The city names a dropdown should offer (hook side): the tenant's SELECTED
 * destinations' cities in catalog order — or, when the catalog is empty or
 * unreachable, the built-in Egypt list, byte-identical to the pre-catalog
 * dropdowns.
 */
export function citiesForDropdown(catalog: CatalogDestination[]): string[] {
  const rows = catalog.filter(d => d.selected).flatMap(d => d.cities)
  return rows.length === 0 ? [...EGYPT_CITIES] : rows.map(c => c.name)
}

