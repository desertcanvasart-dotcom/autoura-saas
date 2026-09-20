// ============================================
// Which entrance fee a wording means
// ============================================
// The lookup used to be `attraction_name ILIKE '%wording%' LIMIT 1` with no
// ORDER BY — the first fee whose name CONTAINS the wording, whichever row
// Postgres happened to return. Found on live data, 2026-09-20, in all five
// agencies' sheets:
//
//   "Egyptian Museum"  also matches  "The Grand Egyptian Museum (GEM)"
//                                    — 1,640 EGP instead of 600
//   "Saqqara"          matches three: Saqqara, Saqqara Monuments,
//                                    Serapeum of Saqqara
//   "Deir El Madina"   also matches  "Deir El Madina – Tomb of Pashdo"
//   "Abu Simbel"       also matches  "Abu Simbel Sound & Light"
//
// and the answer was reported as DEFINITE. An alias cannot pin these either:
// its canonical name goes through this same match.
//
// The rule — the same refuse-to-guess rule as hotels, ships and guides
// (lib/pricing/candidate-selection.ts):
//
//   1. a fee whose name IS the wording        → that fee
//   2. otherwise exactly one that contains it → that fee ("Karnak" → "Karnak
//                                               Temple", while it is the only one)
//   3. otherwise several that contain it      → AMBIGUOUS: a named gap. Never
//                                               the first row.
//   4. nothing                                → none
//
// Pure: no database, no framework.

import { AMBIGUITY_NAMES_SHOWN, type Ambiguity } from './candidate-selection'

export type FeeChoice<T> =
  | { kind: 'one'; row: T }
  | { kind: 'ambiguous'; ambiguity: Ambiguity }
  | { kind: 'none' }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * `rows` are the fees whose name contains `wording` (what the query returns).
 * Rows that do not contain it are ignored, so a caller cannot widen the rule
 * by passing too much.
 */
export function chooseEntranceFee<T extends { attraction_name?: string | null }>(
  rows: readonly T[],
  wording: string
): FeeChoice<T> {
  const asked = norm(wording)
  if (!asked) return { kind: 'none' }
  const containing = rows.filter(r => norm(r.attraction_name ?? '').includes(asked))
  if (containing.length === 0) return { kind: 'none' }

  const exact = containing.filter(r => norm(r.attraction_name ?? '') === asked)
  if (exact.length === 1) return { kind: 'one', row: exact[0] }
  // Two rows with the SAME name is the sheet's problem, and still not ours to
  // settle by taking the first.
  const candidates = exact.length > 1 ? exact : containing
  if (candidates.length === 1) return { kind: 'one', row: candidates[0] }

  return {
    kind: 'ambiguous',
    ambiguity: {
      count: candidates.length,
      names: candidates.slice(0, AMBIGUITY_NAMES_SHOWN).map(r => r.attraction_name ?? ''),
      preferredCount: 0,
    },
  }
}

/** What the operator is told. Entrance fees have no "preferred" flag, so the
 *  way out is the wording — or picking the fee on the day. */
export function ambiguousFeeMessage(wording: string, a: Ambiguity): string {
  const list = a.names.map(n => `"${n}"`).join(', ') + (a.count > a.names.length ? ', …' : '')
  // The sheet itself names two fees the same: nothing in the wording can pick.
  if (a.names.every(n => norm(n) === norm(wording))) {
    return (
      `${a.count} entrance fees are all named "${wording}", so no price was chosen. ` +
      `Keep one in Rates → Attractions, or pick the fee on the day in Tour Manager.`
    )
  }
  return (
    `"${wording}" fits ${a.count} entrance fees (${list}) and none is named exactly that, ` +
    `so no price was chosen. Pick the fee on the day in Tour Manager, or word the ` +
    `attraction exactly as Rates → Attractions names it.`
  )
}
