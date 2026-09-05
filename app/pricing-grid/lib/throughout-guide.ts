// ============================================
// The pricing grid learns the throughout guide (B-item 3)
// ============================================
// PURE grid math from what the slots already hold — nothing is fetched in
// the calculator. The guide's BED comes from the chosen hotel/cruise
// option's first-period guide rate (exposed on the option payload by the
// rates route — the same period the headline PP-Double mirrors); his MEALS
// when the party is ≤ 3 are one extra portion of the day's meal picks; one
// SEAT per flight pick at the option's guide fare else the customer fare;
// the rate sheet sizes vehicles at pax+1. A night whose chosen property
// has no guide rate is an AMBER count above the summary — never a silent
// zero bed.

import type { GridDay, GridConfig, RateOption, SelectedItem } from '../types'

export const GRID_GUIDE_MEALS_MAX_PAX = 3

/** rateId → the option's guide rate. Distinguishes "no entry" (absent from
 *  the map) from an explicit null (option known, no guide rate) and from a
 *  real 0 (a flight the guide rides free). */
export type GuideRateIndex = Map<string, number | null>

export function buildGuideRateIndex(allRates: {
  accommodation?: RateOption[]
  cruise?: RateOption[]
  flights?: RateOption[]
}): GuideRateIndex {
  const index: GuideRateIndex = new Map()
  for (const list of [allRates.accommodation, allRates.cruise, allRates.flights]) {
    for (const opt of list ?? []) {
      index.set(opt.id, typeof opt.guide_rate_eur === 'number' ? opt.guide_rate_eur : null)
    }
  }
  return index
}

export interface ThroughoutExtra {
  dayNumber: number
  kind: 'bed' | 'meal' | 'flight_seat'
  label: string
  /** Group cost (charged once — one guide). */
  amountEur: number
}

export interface ThroughoutGuideResult {
  extras: ThroughoutExtra[]
  /** Days whose chosen property has NO guide rate — the amber count. */
  unpricedBedDays: number[]
  totalEur: number
}

const passportRate = (item: SelectedItem, passport: 'eu' | 'non_eu'): number =>
  passport === 'eu' ? item.rateEur : item.rateNonEur

export function computeThroughoutGuideExtras(
  days: GridDay[],
  config: GridConfig,
  index: GuideRateIndex
): ThroughoutGuideResult {
  const result: ThroughoutGuideResult = { extras: [], unpricedBedDays: [], totalEur: 0 }
  if (config.guideMode !== 'throughout') return result

  for (const day of days) {
    // ---- BED: the night's chosen property's guide rate ----
    const stay =
      day.slots.find(s => s.slotId === 'accommodation')?.selectedItems[0] ??
      day.slots.find(s => s.slotId === 'cruise')?.selectedItems[0]
    if (stay) {
      const bedRate = index.get(stay.rateId)
      if (typeof bedRate === 'number' && bedRate > 0) {
        result.extras.push({
          dayNumber: day.dayNumber,
          kind: 'bed',
          label: `Throughout Guide — bed (${stay.name})`,
          amountEur: bedRate,
        })
      } else {
        // No concession on file — amber, never a silent zero bed.
        result.unpricedBedDays.push(day.dayNumber)
      }
    }

    // ---- MEALS: one extra portion of the day's picks when the party is small ----
    if (config.pax <= GRID_GUIDE_MEALS_MAX_PAX) {
      const meals = day.slots.find(s => s.slotId === 'meals')
      for (const item of meals?.selectedItems ?? []) {
        result.extras.push({
          dayNumber: day.dayNumber,
          kind: 'meal',
          label: `Throughout Guide — meal (${item.name})`,
          amountEur: passportRate(item, config.passport),
        })
      }
    }

    // ---- FLIGHT SEAT: the option's guide fare, else the customer fare ----
    const flights = day.slots.find(s => s.slotId === 'flights')
    for (const item of flights?.selectedItems ?? []) {
      const guideFare = index.get(item.rateId)
      // null/absent = customer fare; a real 0 = rides free.
      const seat = typeof guideFare === 'number' ? guideFare : passportRate(item, config.passport)
      result.extras.push({
        dayNumber: day.dayNumber,
        kind: 'flight_seat',
        label: `Throughout Guide — flight seat (${item.name})`,
        amountEur: seat,
      })
    }
  }

  result.totalEur = Math.round(result.extras.reduce((sum, e) => sum + e.amountEur, 0) * 100) / 100
  return result
}
