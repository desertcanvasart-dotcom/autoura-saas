// ============================================
// Who can cover a service line — your team, or a supplier
// ============================================
// docs/supplier-network/PLAN.md §5 step 3. A line is covered either
//   * DIRECTLY by the agency's own people or cars (an itinerary_resources
//     assignment — the one record of "who is assigned", migration 289), with
//     a warning when they are already booked those days; or
//   * by a SUPPLIER, requested and answering by link (next step). Its cost
//     comes from that supplier's own rate for the SAME service; with no such
//     rate the line has no cost (a visible gap) and the operator enters what
//     the supplier agreed — never a guess.
//
// The cost of another supplier is the line's cost scaled by the two rates:
// the engine prices these lines in proportion to the rate (per day, per
// vehicle, per person), so the same service at another supplier's rate costs
// cost × theirs ÷ ours. Only when the two rows are the same service (the key
// columns below), the same currency, both valid on the day, and single-rate
// (or scale the same for EU and non-EU) — otherwise no figure.

import { coversMeals, type MealRateMeals } from '@/lib/meals/meal-rate-meals'

/** Line → which of the agency's own resources may cover it (itinerary_resources.resource_type). */
export function ownResourceTypes(supplierType: string, rateTable: string | null | undefined): string[] {
  if (rateTable === 'airport_staff_rates') return ['airport_staff']
  if (rateTable === 'hotel_staff_rates') return ['hotel_staff']
  if (supplierType === 'transport') return ['vehicle', 'driver']
  if (supplierType === 'guide') return ['guide']
  return []
}

/**
 * Rate sheets where another supplier can do the same service, and the
 * columns that say "the same service". Hotels, ships, flights, trains and
 * activities are left out: there the supplier IS the product — changing it
 * changes the trip, which is an itinerary edit, not sourcing.
 */
export const SAME_SERVICE_KEYS: Record<string, readonly string[]> = {
  guide_rates: ['city', 'guide_type', 'guide_language', 'tour_duration', 'guide_mode'],
  meal_rates: ['city', 'meal_type', 'tier'],
  transportation_rates: ['service_type', 'vehicle_type', 'city', 'origin_city', 'destination_city', 'area', 'duration'],
  airport_staff_rates: ['airport_code', 'service_type', 'direction'],
}

/** The columns to read from each sheet: the key, the figures, currency and validity (no select('*')). */
const RATE_FIGURES: Record<string, readonly string[]> = {
  guide_rates: ['base_rate_eur', 'base_rate_non_eur', 'rate_valid_from', 'rate_valid_to'],
  meal_rates: ['base_rate_eur', 'base_rate_non_eur', 'rate_valid_from', 'rate_valid_to'],
  transportation_rates: ['base_rate_eur', 'base_rate_non_eur'],
  airport_staff_rates: ['rate_eur'],
}

/** Sheets with a preferred star (lib/rates/preferred.ts) among these. */
const PREFERRED_COLUMN: Record<string, string> = { meal_rates: 'is_preferred', transportation_rates: 'is_preferred' }

/** Columns a sheet's "same service" also reads: a guide price lists the
 *  further cities and languages it covers (migration 463). */
const LIST_COLUMNS: Record<string, readonly string[]> = { guide_rates: ['other_cities', 'other_languages'], meal_rates: ['other_meal_types'] }

export function rateColumns(table: string): string {
  return ['id', 'supplier_id', 'rate_currency', 'is_active', ...(SAME_SERVICE_KEYS[table] ?? []), ...(LIST_COLUMNS[table] ?? []), ...(RATE_FIGURES[table] ?? []), ...(PREFERRED_COLUMN[table] ? [PREFERRED_COLUMN[table]] : [])].join(', ')
}

export interface RateRow {
  id: string
  supplier_id: string | null
  base_rate_eur?: number | string | null
  base_rate_non_eur?: number | string | null
  rate_eur?: number | string | null
  rate_currency?: string | null
  rate_valid_from?: string | null
  rate_valid_to?: string | null
  is_active?: boolean | null
  is_preferred?: boolean | null
  [key: string]: unknown
}

const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim().toLowerCase())

const listOf = (first: unknown, more: unknown): Set<string> =>
  new Set([first, ...(Array.isArray(more) ? more : [])].map(norm).filter(Boolean))

/** Does `b` do the service `a` is for? A guide price covers a list of cities
 *  and languages (463): `b` must cover every city and language `a` does, so
 *  a supplier is never costed for a city or language it has no price in. */
export function sameService(table: string, a: RateRow, b: RateRow): boolean {
  const keys = SAME_SERVICE_KEYS[table]
  if (!keys) return false
  if (table === 'guide_rates') {
    const covers = (x: Set<string>, y: Set<string>) => [...x].every(v => y.has(v))
    const aCities = listOf(a.city, a.other_cities), bCities = listOf(b.city, b.other_cities)
    // No city = any city: only another any-city price stands in for one.
    const citiesOk = aCities.size === 0 ? bCities.size === 0 : covers(aCities, bCities)
    return citiesOk
      && covers(listOf(a.guide_language, a.other_languages), listOf(b.guide_language, b.other_languages))
      && keys.filter(k => k !== 'city' && k !== 'guide_language').every(k => norm(a[k]) === norm(b[k]))
  }
  // A meal price covers a list of meals (467): `b` must serve every meal `a`
  // does, so a restaurant is never costed for a meal it has no price for.
  if (table === 'meal_rates') {
    return coversMeals(a as MealRateMeals, b as MealRateMeals)
      && keys.filter(k => k !== 'meal_type').every(k => norm(a[k]) === norm(b[k]))
  }
  return keys.every(k => norm(a[k]) === norm(b[k]))
}

function validOn(r: RateRow, date: string | null): boolean {
  if (r.is_active === false) return false
  if (!date) return true
  if (r.rate_valid_from && r.rate_valid_from.slice(0, 10) > date) return false
  if (r.rate_valid_to && r.rate_valid_to.slice(0, 10) < date) return false
  return true
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export type AlternativeCost =
  | { ok: true; cost: number; rateId: string }
  | { ok: false; reason: string }

/** Pure: what the line would cost at `supplierId`, from that supplier's own rate. */
export function alternativeCost(
  table: string | null | undefined,
  lineCost: number | string | null | undefined,
  pinned: RateRow | null,
  candidates: RateRow[],
  supplierId: string,
  serviceDate: string | null,
): AlternativeCost {
  if (!table || !SAME_SERVICE_KEYS[table]) return { ok: false, reason: 'this kind of service has no rate to compare' }
  const cost = num(lineCost)
  if (!pinned || cost === null) return { ok: false, reason: 'the line has no priced rate to compare with' }
  if (pinned.supplier_id === supplierId) return { ok: true, cost, rateId: pinned.id }

  const theirs = candidates.filter(r => r.supplier_id === supplierId && sameService(table, pinned, r) && validOn(r, serviceDate))
  if (theirs.length === 0) return { ok: false, reason: 'no rate from this supplier for this service' }
  if (theirs.length > 1) return { ok: false, reason: 'this supplier has more than one rate for this service on that day' }
  const alt = theirs[0]
  if (norm(alt.rate_currency) !== norm(pinned.rate_currency)) return { ok: false, reason: 'their rate is in another currency' }

  const ratios: number[] = []
  for (const f of ['base_rate_eur', 'base_rate_non_eur', 'rate_eur'] as const) {
    const ours = num(pinned[f]); const their = num(alt[f])
    if (ours === null && their === null) continue
    if (ours === null || their === null) return { ok: false, reason: 'their rate sheet is filled in differently' }
    ratios.push(their / ours)
  }
  if (ratios.length === 0) return { ok: false, reason: 'no rate figure to compare' }
  if (ratios.some(r => Math.abs(r - ratios[0]) > 1e-6)) return { ok: false, reason: 'their EU and non-EU rates differ from ours in different ways' }
  return { ok: true, cost: Math.round(cost * ratios[0] * 100) / 100, rateId: alt.id }
}
