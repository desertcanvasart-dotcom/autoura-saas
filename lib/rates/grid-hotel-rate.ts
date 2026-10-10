// ============================================
// A hotel's price in the pricing grid
// ============================================
// accommodation_rates carries two column families. The Rates → Hotels
// periods editor writes `seasons` and mirrors the first period onto ppd_eur /
// single_supplement_eur (legacyColumnMirror); the CSV importer writes
// pp_double_eur / single_supp_eur. The grid read only the importer family, so
// a hotel added through the form showed €0.00 in the day builder (operator,
// 2026-10-10: the one budget hotel added for a tour).
//
// The grid now prices a hotel the way the engine does: the period covering
// the trip's start date; with no start date, the first period; a row with no
// periods, its base columns — either family, the editor's first. A start date
// that falls between the operator's periods is a gap, never a silent
// fallback to another period's price (rate-seasons.ts): the hotel lists at 0
// and says why.

import { resolveTravelDateRates, seasonsForRow } from '@/lib/rates/rate-seasons'

export interface GridHotelRate {
  ppdEur: number
  ppdNonEur: number
  singleSuppEur: number
  singleSuppNonEur: number
  /** The throughout guide's bed; null when no concession is on file. */
  guideRateEur: number | null
  /** Name of the period the price came from, when it came from one. */
  periodName: string | null
  /** The start date falls between the hotel's periods: no price for it. */
  gapDate: string | null
}

const positive = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const first = (...vals: unknown[]): number => {
  for (const v of vals) {
    const n = positive(v)
    if (n > 0) return n
  }
  return 0
}

export function gridHotelRate(row: Record<string, unknown>, startDate?: string | null): GridHotelRate {
  const resolved = resolveTravelDateRates(row, 'accommodation', startDate)
  if (resolved.kind === 'gap') {
    return {
      ppdEur: 0, ppdNonEur: 0, singleSuppEur: 0, singleSuppNonEur: 0,
      guideRateEur: null, periodName: null, gapDate: resolved.travelDate,
    }
  }
  // No period for the date (or no date): the first stored period, as the
  // date-less readers always used — legacy rows have none and use the columns.
  const season = resolved.kind === 'period' ? resolved.season : seasonsForRow(row, 'accommodation')[0]
  if (season && positive(season.rates.ppd_eur) > 0) {
    const r = season.rates
    const ppdEur = positive(r.ppd_eur)
    const singleEur = positive(r.single_supplement_eur)
    return {
      ppdEur,
      ppdNonEur: positive(r.ppd_non_eur) || ppdEur,
      singleSuppEur: singleEur,
      singleSuppNonEur: positive(r.single_supplement_non_eur) || singleEur,
      guideRateEur: positive(r.guide_rate_eur) || null,
      periodName: season.name || null,
      gapDate: null,
    }
  }
  const ppdEur = first(row.ppd_eur, row.pp_double_eur)
  const singleEur = first(row.single_supplement_eur, row.single_supp_eur)
  return {
    ppdEur,
    ppdNonEur: first(row.ppd_non_eur, row.pp_double_non_eur) || ppdEur,
    singleSuppEur: singleEur,
    singleSuppNonEur: first(row.single_supplement_non_eur, row.single_supp_non_eur) || singleEur,
    guideRateEur: null,
    periodName: null,
    gapDate: null,
  }
}
