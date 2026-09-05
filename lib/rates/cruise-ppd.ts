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
  duration_nights?: number | string | null
}

/** Nights used for the legacy trip→night derivation (engine default: 4). */
export function cruiseNightsOf(row: CruisePpdRow): number {
  return Math.max(1, Math.floor(num(row.duration_nights)) || 4)
}

/** Per-person-per-night EUR-column figure. 0 = genuinely unpriced. */
export function cruisePpdNightEur(row: CruisePpdRow): number {
  const ppd = num(row.ppd_eur)
  if (ppd > 0) return ppd
  const trip = num(row.rate_double_eur) || num(row.rate_low_double_eur)
  return trip > 0 ? trip / cruiseNightsOf(row) : 0
}

/** Non-EUR variant; falls back to the EUR figure when unset (the tables'
 *  standard non-EU mirror). */
export function cruisePpdNightNonEur(row: CruisePpdRow): number {
  const ppd = num(row.ppd_non_eur)
  if (ppd > 0) return ppd
  const trip = num(row.rate_double_non_eur) || num(row.rate_low_double_non_eur)
  if (trip > 0) return trip / cruiseNightsOf(row)
  return cruisePpdNightEur(row)
}
