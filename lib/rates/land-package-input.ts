// What the Land packages form may save (migration 462). Pure: the API routes
// and the tests call it. Refuses rather than guesses: a night count that does
// not match the days, an unknown night kind, a negative price.

import type { DayMeals, NightPlace } from '@/lib/pricing/land-package'

export const NIGHT_PLACES: readonly NightPlace[] = ['camp', 'hotel', 'other']
export const MAX_PACKAGE_DAYS = 14

/** Every column of land_packages, named (this codebase ratchets select('*') down). */
export const LAND_PACKAGE_COLS =
  'id, tenant_id, supplier_id, service_code, package_name, city, start_city, duration_days, night_places, meals, includes_transport, includes_local_vehicle, includes_guide, includes_entrance, covered_attractions, vehicle_capacity, base_rate_eur, base_rate_non_eur, rate_currency, description, notes, is_active, created_at, updated_at'

export interface LandPackageFields {
  package_name: string
  service_code: string | null
  supplier_id: string | null
  city: string | null
  start_city: string | null
  duration_days: number
  night_places: NightPlace[]
  meals: DayMeals[]
  includes_transport: boolean
  includes_local_vehicle: boolean
  includes_guide: boolean
  includes_entrance: boolean
  covered_attractions: string[]
  vehicle_capacity: number | null
  base_rate_eur: number
  base_rate_non_eur: number
  description: string | null
  notes: string | null
  is_active: boolean
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)

export type LandPackageCheck = { ok: true; row: LandPackageFields } | { ok: false; error: string }

export function validateLandPackage(body: Record<string, unknown>): LandPackageCheck {
  const name = text(body.package_name)
  if (!name) return { ok: false, error: 'Give the package a name.' }

  const days = Number(body.duration_days)
  if (!Number.isInteger(days) || days < 1 || days > MAX_PACKAGE_DAYS) {
    return { ok: false, error: `A package runs 1 to ${MAX_PACKAGE_DAYS} days.` }
  }

  const nightsIn = Array.isArray(body.night_places) ? body.night_places : []
  if (nightsIn.length !== days - 1) {
    return { ok: false, error: `A ${days}-day package has ${days - 1} night${days - 1 === 1 ? '' : 's'} — say where each one is spent.` }
  }
  const bad = nightsIn.find(n => !NIGHT_PLACES.includes(n as NightPlace))
  if (bad !== undefined) return { ok: false, error: `"${String(bad)}" is not a night place — use camp, hotel or other.` }

  const mealsIn = Array.isArray(body.meals) ? body.meals : []
  const meals: DayMeals[] = Array.from({ length: days }, (_, i) => {
    const m = (mealsIn[i] ?? {}) as Record<string, unknown>
    return { breakfast: m.breakfast === true, lunch: m.lunch === true, dinner: m.dinner === true }
  })

  const price = Number(body.base_rate_eur)
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'The price per person must be 0 or more.' }

  const capacityRaw = body.vehicle_capacity
  const capacity = capacityRaw === null || capacityRaw === undefined || capacityRaw === '' ? null : Number(capacityRaw)
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return { ok: false, error: 'People per car must be a whole number, 1 or more.' }
  }

  // Trimmed, inner spaces collapsed, and each place once — its first spelling.
  const covered: string[] = []
  for (const raw of Array.isArray(body.covered_attractions) ? body.covered_attractions : []) {
    if (typeof raw !== 'string') continue
    const place = raw.trim().replace(/\s+/g, ' ')
    if (place && !covered.some(c => c.toLowerCase() === place.toLowerCase())) covered.push(place)
  }

  return {
    ok: true,
    row: {
      package_name: name,
      service_code: text(body.service_code),
      supplier_id: text(body.supplier_id),
      city: text(body.city),
      start_city: text(body.start_city),
      duration_days: days,
      night_places: nightsIn as NightPlace[],
      meals,
      includes_transport: bool(body.includes_transport, true),
      includes_local_vehicle: bool(body.includes_local_vehicle, false),
      includes_guide: bool(body.includes_guide, true),
      includes_entrance: bool(body.includes_entrance, true),
      covered_attractions: covered,
      vehicle_capacity: capacity,
      // One price per person (single-rate entry): the non-EU column mirrors it.
      base_rate_eur: price,
      base_rate_non_eur: price,
      description: text(body.description),
      notes: text(body.notes),
      is_active: bool(body.is_active, true),
    },
  }
}
