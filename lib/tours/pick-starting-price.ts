// ============================================================================
// Which tier's price a tour card shows — and whether it is a whole price
// ============================================================================
// The engine prices every tier of a tour. This picks the ONE figure the card
// shows, by the operator's rule (sibling #461):
//
//   1. the cheapest tier whose price is COMPLETE — never an estimate built on
//      a missing rate;
//   2. when no tier is complete, the tier MISSING THE FEWEST services (cheapest
//      on a tie), shown marked incomplete with that count. Picking the plainly
//      cheapest tier would reward missing rates — a tier with nine holes prices
//      lower than one with four precisely because nine services cost nothing.
//   3. when no tier priced anything (every line a hole, or no days), nothing.
//
// Pure and import-free, so the rule is tested without the engine or a database.

export interface TierPrice {
  tier: string
  /** Per person, in the tenant's currency. Nonsense (0, negative, NaN) counts
   *  as "did not price". */
  price: number
  complete: boolean
  /** Services this tier could not price. 0 on a complete tier. */
  gaps: number
}

export interface StartingChoice {
  tier: string
  price: number
  complete: boolean
  gaps: number
}

const priced = (t: TierPrice): boolean => Number.isFinite(t.price) && t.price > 0

export function pickStartingPrice(tiers: readonly TierPrice[]): StartingChoice | null {
  const usable = tiers.filter(priced)

  const complete = usable.filter(t => t.complete)
  if (complete.length > 0) {
    const best = complete.reduce((a, b) => (b.price < a.price ? b : a))
    return { tier: best.tier, price: best.price, complete: true, gaps: 0 }
  }

  if (usable.length > 0) {
    // Fewest gaps wins; cheapest breaks a tie.
    const best = usable.reduce((a, b) =>
      (b.gaps < a.gaps || (b.gaps === a.gaps && b.price < a.price)) ? b : a)
    return { tier: best.tier, price: best.price, complete: false, gaps: best.gaps }
  }

  return null
}
