import { describe, it, expect } from 'vitest'
import { pickStartingPrice, type TierPrice } from '@/lib/tours/pick-starting-price'

// ============================================================================
// The card shows the cheapest COMPLETE tier; when none is complete, the tier
// missing the fewest services (cheapest on a tie), marked incomplete. Picking
// the plainly cheapest would reward gaps. (sibling #461)
// ============================================================================

const t = (over: Partial<TierPrice>): TierPrice =>
  ({ tier: 'standard', price: 100, complete: true, gaps: 0, ...over })

describe('pickStartingPrice', () => {
  it('takes the cheapest tier whose price is complete', () => {
    const choice = pickStartingPrice([
      t({ tier: 'standard', price: 2072, complete: true }),
      t({ tier: 'luxury', price: 3400, complete: true }),
    ])
    expect(choice).toEqual({ tier: 'standard', price: 2072, complete: true, gaps: 0 })
  })

  it('ignores a cheaper INCOMPLETE tier when any tier is complete', () => {
    const choice = pickStartingPrice([
      t({ tier: 'luxury', price: 1021, complete: false, gaps: 9 }),
      t({ tier: 'standard', price: 2072, complete: true }),
    ])
    expect(choice).toEqual({ tier: 'standard', price: 2072, complete: true, gaps: 0 })
  })

  it('when no tier is complete, takes the one missing the FEWEST services — NMS803', () => {
    // The live case in #461: Luxury $1,021 with 9 gaps against Standard $2,072
    // with 4. The card shows $2,072 · Standard · incomplete (4).
    const choice = pickStartingPrice([
      t({ tier: 'luxury', price: 1021, complete: false, gaps: 9 }),
      t({ tier: 'standard', price: 2072, complete: false, gaps: 4 }),
    ])
    expect(choice).toEqual({ tier: 'standard', price: 2072, complete: false, gaps: 4 })
  })

  it('breaks a gap-count tie by the cheaper price', () => {
    const choice = pickStartingPrice([
      t({ tier: 'luxury', price: 900, complete: false, gaps: 3 }),
      t({ tier: 'standard', price: 700, complete: false, gaps: 3 }),
    ])
    expect(choice).toEqual({ tier: 'standard', price: 700, complete: false, gaps: 3 })
  })

  it('treats a nonsense price (0, negative, NaN, Infinity) as not priced', () => {
    expect(pickStartingPrice([t({ price: 0 }), t({ price: -5 }), t({ price: NaN })])).toBeNull()
    expect(pickStartingPrice([t({ tier: 'a', price: Infinity, complete: false, gaps: 1 })])).toBeNull()
  })

  it('is nothing when no tier priced anything', () => {
    expect(pickStartingPrice([])).toBeNull()
  })

  it('a zero-priced "complete" tier does not win — it never really priced', () => {
    const choice = pickStartingPrice([
      t({ tier: 'standard', price: 0, complete: true }),
      t({ tier: 'luxury', price: 1500, complete: false, gaps: 2 }),
    ])
    expect(choice).toEqual({ tier: 'luxury', price: 1500, complete: false, gaps: 2 })
  })
})
