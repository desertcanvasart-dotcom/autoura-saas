// ============================================
// Which attractions a day is priced for
// ============================================
// A tour says what it visits in TWO places: "Main Attractions" on the tour
// itself (tour_templates.main_attractions — what the Tour Manager's Details
// tab shows as green chips, picked from the agency's own fee sheet), and the
// attractions on each DAY. The engine only ever read the second.
//
// Found 2026-09-21 by the operator, looking at "Aswan Highlights — Unfinished
// Obelisk, High Dam & Philae": three attractions picked on the tour, and a
// report saying the tour "names no attractions". Both were true, and the
// report was the one that was wrong. 14 live one-day tours were in that
// state (13 Sawa Tours, 1 Travel2Egypt).
//
// THE RULE
//   - A day that names its own attractions (worded, or picked) is priced for
//     those. Always.
//   - A ONE-DAY tour whose day names none is priced for the TOUR's
//     attractions: there is one day, so there is no question which day they
//     belong to. This is not a guess.
//   - A MULTI-DAY tour's attractions are NOT handed out to its days. Which
//     day visits Karnak is exactly what the tour-level list does not say, and
//     dealing them out by city or by order would be a guess. Each day states
//     its own (Edit on the day), or says it has no sightseeing.
//   - "No guided sightseeing on this day" always wins.
//
// Pure and import-free: the engine, Settings → Attraction names and the Tour
// Manager (a client component) all read this one rule.

export interface DayWithAttractions {
  attractions?: unknown
  attraction_ids?: unknown
  sightseeing?: unknown
}

const words = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map(a => a.trim()) : []

const hasIds = (v: unknown): boolean =>
  Array.isArray(v) && v.some(id => typeof id === 'string' && id.length > 0)

/** Does the day itself name anything — in words, or picked from the fee sheet? */
export function dayNamesAttractions(day: DayWithAttractions | null | undefined): boolean {
  return !!day && (words(day.attractions).length > 0 || hasIds(day.attraction_ids))
}

/** Does this day take the tour's attractions as its own? */
export function inheritsTourAttractions(
  day: DayWithAttractions | null | undefined,
  dayCount: number,
  tourAttractions: unknown
): boolean {
  return dayCount === 1 && !!day && day.sightseeing !== 'none' && !dayNamesAttractions(day) && words(tourAttractions).length > 0
}

/**
 * The worded attractions the day is priced for. (Picked ids are read
 * separately and outrank wording — a day with ids never inherits.)
 */
export function wordedAttractionsForDay(
  day: DayWithAttractions | null | undefined,
  dayCount: number,
  tourAttractions: unknown
): string[] {
  if (!day) return []
  if (inheritsTourAttractions(day, dayCount, tourAttractions)) return [...new Set(words(tourAttractions))]
  return words(day.attractions)
}
