// ============================================
// A supplier bill's match state, from what is linked to it
// ============================================
// Pure: the match route and the tests share it (documents audit, round 12).

/** Matching is open only before review. A disputed bill is contested and an
 *  approved one is cleared for payment: re-matching or unlinking one flipped
 *  it back to 'matched'/'received', dropping the dispute or the approval
 *  without anyone resolving it — and a paid one could be approved and paid
 *  again. */
export const MATCHABLE = ['received', 'matched']

export const isMatchable = (status: string | null | undefined) => MATCHABLE.includes(String(status ?? ''))

const TOLERANCE = 0.01

export interface MatchState {
  matched_amount: number
  discrepancy_amount: number
  match_status: 'unmatched' | 'partial' | 'matched' | 'discrepancy'
  /** Only an exact match is 'matched'; a partial match still needs follow-up
   *  before approval — it used to be marked 'matched' all the same. */
  status: 'received' | 'matched'
}

export function matchState(invoiceAmount: unknown, matchedAmounts: unknown[]): MatchState {
  const amount = Number(invoiceAmount || 0)
  const matched = Math.round(matchedAmounts.reduce<number>((s, m) => s + Number(m || 0), 0) * 100) / 100
  const discrepancy = Math.round((amount - matched) * 100) / 100
  const match_status: MatchState['match_status'] =
    matched === 0 ? 'unmatched'
      : Math.abs(discrepancy) <= TOLERANCE ? 'matched'
        : matched < amount ? 'partial'
          : 'discrepancy'
  return {
    matched_amount: matched,
    discrepancy_amount: discrepancy,
    match_status,
    status: match_status === 'matched' ? 'matched' : 'received',
  }
}

const code = (c: unknown) => String(c || 'EUR').toUpperCase()

/** The expenses not in the bill's currency: amounts were compared as plain
 *  numbers, so a EUR 1,000 expense "matched" a USD 1,000 bill. */
export function otherCurrency<T extends { id: string; currency?: string | null }>(billCurrency: unknown, expenses: T[]): string[] {
  return expenses.filter(e => code(e.currency) !== code(billCurrency)).map(e => e.id)
}
