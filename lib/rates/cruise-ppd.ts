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
//   - Legacy trip-cabin model (rate_double_eur family): a whole-trip
//     DOUBLE CABIN price. Per person per night = cabin / 2 occupants
//     / nights — the exact derivation the engine's legacy fallback uses
//     (lib/auto-pricing-service.ts), duplicated nowhere else.

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
  const tripCabin = num(row.rate_double_eur) || num(row.rate_low_double_eur)
  return tripCabin > 0 ? tripCabin / 2 / cruiseNightsOf(row) : 0
}

/** Non-EUR variant; falls back to the EUR figure when unset (the tables'
 *  standard non-EU mirror). */
export function cruisePpdNightNonEur(row: CruisePpdRow): number {
  const ppd = num(row.ppd_non_eur)
  if (ppd > 0) return ppd
  const tripCabin = num(row.rate_double_non_eur) || num(row.rate_low_double_non_eur)
  if (tripCabin > 0) return tripCabin / 2 / cruiseNightsOf(row)
  return cruisePpdNightEur(row)
}
