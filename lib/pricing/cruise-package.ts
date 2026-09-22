// ============================================
// Cruise sightseeing transport: which package a sailing needs (sibling #463)
// ============================================
// A package in Rates → Transport Packages is sold by the cruise's length in
// DAYS: "4D" is a 3-night cruise, "5D" a 4-night one. The sibling's engine
// counted the NIGHTS and sold a 4-night cruise the 4D package, then fell back
// to the closest length when the exact one was missing — the wrong package at
// the wrong price (operator, 2026-09-17).
//
//   - a sailing is a run of consecutive nights aboard; its length in days is
//     nights + 1 (the disembarkation day, whose transfer off the ship the
//     package covers);
//   - a package is matched by that EXACT length; a neighbouring length is
//     never used.
//
// In THIS app a package is one of two ways an agency prices a cruise's
// sightseeing transport — the other is a day-tour rate per city, which every
// live agency uses today and no package exists yet. So: an exact-length
// package wins when the agency has one; with none, the per-day rates apply as
// before. Both are the agency's own rates; neither is a guess.
//
// Pure and import-free.

export interface SailingDay { day: number; accommodation_type?: string | null }

export interface Sailing {
  /** Nights aboard. */
  nights: number
  /** The package length this sailing needs: nights + 1. */
  durationDays: number
  /** The day numbers spent aboard (one per night), in order. */
  nightDays: number[]
  /** The day the party leaves the ship, when the programme has one. */
  disembarkDay: number | null
}

/** Every sailing in the programme, in order. */
export function cruiseSailings(days: readonly SailingDay[]): Sailing[] {
  const sailings: Sailing[] = []
  let run: number[] = []
  const close = (nextIndex: number) => {
    if (run.length === 0) return
    const after = days[nextIndex]
    sailings.push({ nights: run.length, durationDays: run.length + 1, nightDays: run, disembarkDay: after ? after.day : null })
    run = []
  }
  days.forEach((d, i) => {
    if (d.accommodation_type === 'cruise') run.push(d.day)
    else close(i)
  })
  close(days.length)
  return sailings
}

/** The package for a sailing of `durationDays`: the exact length only, and
 *  exactly one — two of the same length is a choice the engine does not make. */
export function packageForDuration<P extends { duration_days?: number | null }>(
  packages: readonly P[], durationDays: number
): { kind: 'none' } | { kind: 'one'; pkg: P } | { kind: 'ambiguous'; count: number } {
  const exact = packages.filter(p => p.duration_days === durationDays)
  if (exact.length === 0) return { kind: 'none' }
  if (exact.length === 1) return { kind: 'one', pkg: exact[0] }
  return { kind: 'ambiguous', count: exact.length }
}
