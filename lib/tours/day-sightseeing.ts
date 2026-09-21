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
