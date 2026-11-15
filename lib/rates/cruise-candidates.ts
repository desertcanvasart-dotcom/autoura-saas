// ============================================
// Which Nile cruise rows compete — for the preferred star and for pricing
// ============================================
// A cruise row is ONE sailing: a ship, its standard (tier), its route
// (embark → disembark) and its length in nights.
// The star used to be one per TIER (migration 354): starring the 4-night
// Luxor → Aswan Ceila unticked the 3-night Aswan → Luxor Ceila, although a
// tour can never be priced from both (operator, 2026-11-15). And the engine
// chose among every ship of the tier leaving that city, whatever its length.
//
// Two rows now compete only when a tour could be priced from either:
//   · same tier, same embark city, same disembark city (case-insensitive);
//   · their lengths overlap — a row that states no length overlaps any.
// So one preferred ship per route + length, and starring one clears only the
// rows it competes with. The weekday does NOT split the star (operator,
// 2026-11-15: "one boat per route"): a website "From" price has no date, so
// two starred boats on one route and length, sailing different days, would
// leave it unable to choose.
//
// Pure and import-light: the star route, the bulk import and the engine share it.

import { cruiseLengthsToStore } from './cruise-ppd'

export interface CruiseScopeRow {
  tier?: unknown
  embark_city?: unknown
  disembark_city?: unknown
  duration_nights?: unknown
  sailing_days?: unknown
}

const word = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The lengths a row states, or [] for "not stated" (= any). */
export const cruiseLengths = (v: unknown): number[] => cruiseLengthsToStore(v) ?? []

const overlap = <T>(a: T[], b: T[]) => a.length === 0 || b.length === 0 || a.some(x => b.includes(x))

/** Whether a tour could be priced from either row — the star's scope. */
export function cruisesCompete(a: CruiseScopeRow, b: CruiseScopeRow): boolean {
  return word(a.tier) === word(b.tier)
    && word(a.embark_city) === word(b.embark_city)
    && word(a.disembark_city) === word(b.disembark_city)
    && overlap(cruiseLengths(a.duration_nights), cruiseLengths(b.duration_nights))
}

/**
 * The ships a sailing can be priced from, narrowed to the tour's length in
 * nights — a 3-night tour is not priced from the 4-night ship. Applies only
 * when it leaves at least one ship: a length no ship matches keeps the wider
 * list, priced as before rather than losing its cruise.
 *
 * NOT by weekday: one boat per route and length is the operator's rule, so
 * the starred boat is used whatever day the party boards, and the engine's
 * sailing-day warning says when that day does not suit it.
 */
export function narrowCruiseCandidates<T extends CruiseScopeRow>(rows: readonly T[], want: { nights?: number | null }): T[] {
  if (!want.nights || want.nights <= 0) return [...rows]
  const n = want.nights
  const fit = rows.filter(r => { const l = cruiseLengths(r.duration_nights); return l.length === 0 || l.includes(n) })
  return fit.length > 0 ? fit : [...rows]
}

/** "standard · Aswan → Luxor · 3 nights" — for the star's toast (the scope; no weekday). */
export function describeCruiseScope(r: CruiseScopeRow): string {
  const lengths = cruiseLengths(r.duration_nights)
  const route = [r.embark_city, r.disembark_city].map(v => String(v ?? '').trim()).filter(Boolean).join(' → ')
  return [
    String(r.tier ?? '').trim(),
    route,
    lengths.length ? `${lengths.join('/')} night${lengths.length === 1 && lengths[0] === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')
}
