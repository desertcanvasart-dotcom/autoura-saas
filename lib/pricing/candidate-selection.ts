// ============================================
// Choosing ONE rate row among several — the refuse-to-guess rule
// ============================================
// A city + tier can hold many hotels, restaurants or ships. The engine used
// to take `limit(1)`: whichever row Postgres returned first, an arbitrary and
// undocumented pick. The rule now (operator decision, 7 Sep):
//
//   1. one candidate                → use it
//   2. several, exactly one preferred → use the preferred one
//   3. several, none/many preferred  → AMBIGUOUS: a pricing hole naming the
//                                      candidates. Never a guess.
//
// The itinerary's own pin (itinerary_services.rate_table/rate_id) sits above
// all three and is resolved by the caller before this rule is consulted.

export type CandidatePick<T> =
  | { kind: 'none' }
  | { kind: 'one'; row: T }
  | { kind: 'ambiguous'; count: number; names: string[]; preferredCount: number }

/** How many candidate names a hole message lists before "…". */
export const AMBIGUITY_NAMES_SHOWN = 4

export function pickCandidate<T>(
  rows: readonly T[],
  nameOf: (row: T) => string,
  isPreferred: (row: T) => boolean = row => (row as { is_preferred?: unknown }).is_preferred === true
): CandidatePick<T> {
  if (rows.length === 0) return { kind: 'none' }
  if (rows.length === 1) return { kind: 'one', row: rows[0] }
  const preferred = rows.filter(isPreferred)
  if (preferred.length === 1) return { kind: 'one', row: preferred[0] }
  return {
    kind: 'ambiguous',
    count: rows.length,
    names: rows.slice(0, AMBIGUITY_NAMES_SHOWN).map(nameOf),
    preferredCount: preferred.length,
  }
}

export interface Ambiguity {
  count: number
  names: string[]
  preferredCount: number
}

/**
 * The operator-facing hole message for an ambiguous pick: what was found,
 * and the two ways to resolve it (mark a preferred row, or pin one in the
 * pricing grid).
 */
export function ambiguityMessage(
  what: string,            // "standard hotels in Cairo"
  a: Ambiguity,
  ratesPage: string        // "Rates → Hotels"
): string {
  const list = a.names.join(', ') + (a.count > a.names.length ? ', …' : '')
  const why = a.preferredCount > 1
    ? `${a.preferredCount} are marked preferred`
    : 'none is marked preferred'
  return `${a.count} ${what} (${list}) and ${why}. Mark exactly one as preferred in ${ratesPage}, or pick one in the pricing grid.`
}
