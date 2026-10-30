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

export function rateColumns(table: string): string {
  return ['id', 'supplier_id', 'rate_currency', 'is_active', ...(SAME_SERVICE_KEYS[table] ?? []), ...(RATE_FIGURES[table] ?? [])].join(', ')
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
  [key: string]: unknown
}

const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim().toLowerCase())

export function sameService(table: string, a: RateRow, b: RateRow): boolean {
  const keys = SAME_SERVICE_KEYS[table]
  return !!keys && keys.every(k => norm(a[k]) === norm(b[k]))
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
