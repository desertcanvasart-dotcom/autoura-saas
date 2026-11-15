// ============================================
// Which Nile cruise rows compete — for the preferred star and for pricing
// ============================================
// A cruise row is ONE sailing: a ship, its standard (tier), its route
// (embark → disembark), its length in nights and the weekdays it leaves on.
// The star used to be one per TIER (migration 354): starring the 4-night
// Luxor → Aswan Ceila unticked the 3-night Aswan → Luxor Ceila, although a
// tour can never be priced from both (operator, 2026-11-15). And the engine
// chose among every ship of the tier leaving that city, whatever its length.
//
// Two rows now compete only when a tour could be priced from either:
//   · same tier, same embark city, same disembark city (case-insensitive);
//   · their lengths overlap — a row that states no length overlaps any;
//   · their weekdays overlap — a row with no fixed weekday sails any day.
// So one preferred ship per route + length + weekday, and starring one clears
// only the rows it competes with.
//
// Pure and import-light: the star route, the bulk import and the engine share it.

import { cruiseLengthsToStore } from './cruise-ppd'
import { dayOfDate, sanitizeSailingDays } from './cruise-sailing'

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
    && overlap(sanitizeSailingDays(a.sailing_days), sanitizeSailingDays(b.sailing_days))
}

/**
 * The ships a sailing can be priced from, narrowed by what the tour knows:
 * its length in nights, and the boarding date (so its weekday). Each narrowing
 * applies only when it leaves at least one ship: a tour whose length or day no
 * ship matches keeps the wider list, and is priced and warned about exactly as
 * before (the sailing-day warning in the engine) rather than losing its cruise.
 */
export function narrowCruiseCandidates<T extends CruiseScopeRow>(
  rows: readonly T[],
  want: { nights?: number | null; boardingDate?: string | null },
): T[] {
  let out = [...rows]
  if (want.nights && want.nights > 0) {
    const n = want.nights
    const fit = out.filter(r => { const l = cruiseLengths(r.duration_nights); return l.length === 0 || l.includes(n) })
    if (fit.length > 0) out = fit
  }
  const weekday = dayOfDate(want.boardingDate ?? null)
  if (weekday) {
    const fit = out.filter(r => { const d = sanitizeSailingDays(r.sailing_days); return d.length === 0 || d.includes(weekday) })
    if (fit.length > 0) out = fit
  }
  return out
}

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

/** "standard · Aswan → Luxor · 3 nights · Fri" — for the star's toast. */
export function describeCruiseScope(r: CruiseScopeRow): string {
  const lengths = cruiseLengths(r.duration_nights)
  const days = sanitizeSailingDays(r.sailing_days)
  const route = [r.embark_city, r.disembark_city].map(v => String(v ?? '').trim()).filter(Boolean).join(' → ')
  return [
    String(r.tier ?? '').trim(),
    route,
    lengths.length ? `${lengths.join('/')} night${lengths.length === 1 && lengths[0] === 1 ? '' : 's'}` : '',
    days.map(d => DAY_LABEL[d] ?? d).join(', '),
  ].filter(Boolean).join(' · ')
}
