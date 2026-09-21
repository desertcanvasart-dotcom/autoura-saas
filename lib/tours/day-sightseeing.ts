// ============================================
// Does a day SAY whether it includes sightseeing?
// ============================================
// Everything a sightseeing day costs hangs off one fact. The engine asks for
// entrance fees, a guide, a vehicle and tips only when a day has attractions
// (or says a guide is required). A day that says NOTHING about sightseeing is
// therefore priced as a free day — silently, because "no sightseeing" and
// "nobody said" looked the same.
//
// Checked on production, 2026-09-21: 28 of Sawa Tours' 48 days and 3 of
// Travel2Egypt's 40 said nothing. That is how a one-day tour called
// "Unfinished Obelisk, High Dam & Philae" reached the calculator priced at its
// lunch.
//
// The operator's rule for meals — "a blank is not 'none'; it is an itinerary
// that has not said" — applied to sightseeing. A day states it by:
//
//   - naming attractions (worded, or picked from the fee sheet), or
//   - carrying a `services` block — how the days sheet, the AI builder and the
//     template creator write a day; on production these are the arrival,
//     departure and travel days, written on purpose with their airport
//     transfers — or
//   - saying `sightseeing: 'none'`: the day editor's "No guided sightseeing on
//     this day", for the days it writes, which carry no services block.
//
// A word in the TITLE is not a statement. ("Temple" in a title still earns a
// guide from the engine's old fallback; it does not make the day stated.)
//
// Pure and import-free: the engine, the days sheet and the day editor — a
// client component — all read this one rule.

export type SightseeingStatement = 'attractions' | 'guided' | 'none' | 'unstated'

export interface DayLike {
  attractions?: unknown
  attraction_ids?: unknown
  services?: unknown
  sightseeing?: unknown
}

const nonEmptyList = (v: unknown): boolean =>
  Array.isArray(v) && v.some(x => typeof x === 'string' && x.trim() !== '')

export function sightseeingStatement(day: DayLike | null | undefined): SightseeingStatement {
  if (!day) return 'unstated'
  if (nonEmptyList(day.attractions) || nonEmptyList(day.attraction_ids)) return 'attractions'
  const services = day.services && typeof day.services === 'object' ? (day.services as { guide_required?: unknown }) : null
  if (services?.guide_required === true) return 'guided'
  if (day.sightseeing === 'none') return 'none'
  // A services block that asks for no guide IS a statement: somebody wrote it.
  if (services) return 'none'
  return 'unstated'
}

export const sightseeingIsStated = (day: DayLike | null | undefined): boolean =>
  sightseeingStatement(day) !== 'unstated'

/** One wording for the engine's gap, the editor's list and the days sheet. */
export const SIGHTSEEING_NOT_STATED =
  'does not say whether it includes sightseeing, so it would be priced as a free day — ' +
  'without its entrance fees, guide, vehicle or tips'

export const SIGHTSEEING_HOW_TO_STATE =
  'pick the attractions it visits, or tick "No guided sightseeing on this day"'

// ---- day tours ----
// The operator's rule (2026-09-21): "Overnight at a certain city is used only
// in packages, but day tours do not require overnight or stays to be priced.
// However, days which include guiding, entrance fees, transportation, meals
// and tipping should be calculated correctly, not ignored."
//
// So on a day tour a day never has to SAY it has sightseeing — it is one: the
// guide, the vehicle and the tips are asked for regardless, there is never a
// night, and the only thing a day can still be missing is the NAMES of what it
// visits, for the entrance fees.

/** Tour types that are one day by definition. */
export const SINGLE_DAY_TOUR_TYPES: readonly string[] = ['day_tour', 'half_day', 'stopover']

/** A day tour by its type — or by being one day long, which cannot have an
 *  overnight either. */
export function isDayTourProgramme(tourType: string | null | undefined, dayCount: number): boolean {
  return SINGLE_DAY_TOUR_TYPES.includes(tourType ?? '') || dayCount === 1
}

/** On a day tour, the one thing a day can still fail to say. */
export function dayTourNamesNoAttractions(day: DayLike | null | undefined): boolean {
  if (!day || day.sightseeing === 'none') return false
  return sightseeingStatement({ attractions: day.attractions, attraction_ids: day.attraction_ids }) !== 'attractions'
}

export const DAY_TOUR_NO_ATTRACTIONS =
  'names no attractions, so its entrance fees cannot be priced — the guide, the vehicle and the tips are'
