// ============================================
// Cruise pricing basis: PER PERSON, PER NIGHT
// ============================================
// The one basis cruise money is quoted in (locked 2026-09-05): a
// per-person-per-night figure multiplied by the cruise's nights — a
// 3-night cruise charges x3, a 4-night x4. The engine already prices this
// way (ppdNight x cruiseNights, supplements included); this helper gives
// every OTHER surface (the pricing grid's day slots) the same number.
//
// Two storage generations:
//   - PPD model (ppd_eur family / seasons periods): already per person
//     per night — used as-is.
//   - Legacy trip model (rate_double_eur family): a whole-trip
//     PER-PERSON price at double occupancy — the sibling app's engine
//     states it outright ("rate_double_eur is already per-person"), and
//     it matches this repo's own hotel convention (pp_double_eur is
//     per-person). Per person per night = trip / nights. (This repo's
//     legacy fallback divided by 2 as if it were a cabin rate — that
//     HALVED legacy cruise prices and is fixed alongside this helper.)

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

export interface CruisePpdRow {
  ppd_eur?: number | string | null
  ppd_non_eur?: number | string | null
  rate_double_eur?: number | string | null
  rate_low_double_eur?: number | string | null
  rate_double_non_eur?: number | string | null
  rate_low_double_non_eur?: number | string | null
  duration_nights?: unknown
}

/**
 * How many nights the cruise is — when it SAYS, and only then.
 *
 * `nile_cruises.duration_nights` is a JSON LIST of the lengths a ship sails
 * (the rate form is a multi-select), and a plain number on rows that came from
 * a sheet. Both are read here. The length is needed for exactly one thing:
 * turning a price entered PER TRIP into a price per night.
 *
 *   - a number above 0, or a list holding exactly one      → that many nights
 *   - a list of SEVERAL lengths ([3, 4, 7])                → null: a per-trip
 *     price cannot say which of those trips it is the price of
 *   - nothing, 0, or anything else                         → null
 *
 * It used to be `|| 4` in five places — and one of them read the list as "not
 * a number", so a 7-night ship was divided by 4 on import and export. A ship
 * priced per trip that does not say how long the trip is has no nightly price;
 * the engine records that as a gap (getCruiseRates → noDuration).
 */
export function cruiseNightsStated(value: unknown): number | null {
  const one = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value
  const n = typeof one === 'string' && one.trim() !== '' ? Number(one) : one
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
}

/** The lengths to STORE from a request body: the positive whole numbers it
 *  sent, as a list. undefined when it sent none — callers then leave the
 *  column alone (an update) or store NULL (a create); never an invented [4]. */
export function cruiseLengthsToStore(value: unknown): number[] | undefined {
  const list = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value])
    .map(v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1)
    .map(n => Math.floor(n))
  return list.length > 0 ? [...new Set(list)].sort((a, b) => a - b) : undefined
}

/** Per-person-per-night EUR-column figure. 0 = genuinely unpriced. */
export function cruisePpdNightEur(row: CruisePpdRow): number {
  const ppd = num(row.ppd_eur)
  if (ppd > 0) return ppd
  const trip = num(row.rate_double_eur) || num(row.rate_low_double_eur)
  const nights = cruiseNightsStated(row.duration_nights)
  return trip > 0 && nights ? trip / nights : 0
}

/** Non-EUR variant; falls back to the EUR figure when unset (the tables'
 *  standard non-EU mirror). */
export function cruisePpdNightNonEur(row: CruisePpdRow): number {
  const ppd = num(row.ppd_non_eur)
  if (ppd > 0) return ppd
  const trip = num(row.rate_double_non_eur) || num(row.rate_low_double_non_eur)
  const nights = cruiseNightsStated(row.duration_nights)
  if (trip > 0 && nights) return trip / nights
  return cruisePpdNightEur(row)
}
