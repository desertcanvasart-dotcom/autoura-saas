import { describe, it, expect } from 'vitest'
import { resolveEntranceRate } from '@/lib/pricing/entrance-rate'

// ============================================================================
// Check 8: "an empty rate means 'not set yet', not 'free'".
//
// Before migration 278 entrance_fees.eur_rate was NOT NULL DEFAULT 0, so those
// two states were the same value and five call sites each guessed differently:
// the engine's caller demanded `rate > 0` and reported genuinely free
// attractions as MISSING rates, while two B2B routes had no guard and emitted
// real EUR 0 lines labelled `rateSource: 'entrance_fees'`.
//
// The distinction only holds if null and 0 stay distinguishable all the way
// through, which is what these assert.
// ============================================================================

describe('resolveEntranceRate', () => {
  it('returns null when the attraction has no price recorded', () => {
    expect(resolveEntranceRate({ eur_rate: null, non_eur_rate: null }, true)).toBeNull()
    expect(resolveEntranceRate({ eur_rate: null, non_eur_rate: null }, false)).toBeNull()
  })

  it('returns 0 for a genuinely free attraction — NOT null', () => {
    // Khan el-Khalili is a bazaar with no entry ticket. Treating this as
    // "unpriced" sent the operator to fix something already correct.
    expect(resolveEntranceRate({ eur_rate: 0, non_eur_rate: 0 }, true)).toBe(0)
    expect(resolveEntranceRate({ eur_rate: 0, non_eur_rate: 0 }, false)).toBe(0)
  })

  it('returns the price when there is one', () => {
    expect(resolveEntranceRate({ eur_rate: 22.5, non_eur_rate: 18 }, true)).toBe(22.5)
    expect(resolveEntranceRate({ eur_rate: 22.5, non_eur_rate: 18 }, false)).toBe(18)
  })

  it('falls back to the EUR rate for a non-EUR traveller only when absent', () => {
    expect(resolveEntranceRate({ eur_rate: 30, non_eur_rate: null }, false)).toBe(30)
  })

  it('does NOT fall back when the non-EUR rate is a deliberate 0', () => {
    // The bug this replaces: `non_eur_rate || eur_rate` charged a non-EUR
    // traveller the EUR price for an attraction that is free to them.
    expect(resolveEntranceRate({ eur_rate: 30, non_eur_rate: 0 }, false)).toBe(0)
  })

  it('treats an unparseable rate as unpriced, not free', () => {
    expect(resolveEntranceRate({ eur_rate: 'abc' }, true)).toBeNull()
    expect(resolveEntranceRate({ eur_rate: '' }, true)).toBeNull()
  })

  it('accepts numeric strings, which is how postgres numerics arrive', () => {
    expect(resolveEntranceRate({ eur_rate: '22.50' }, true)).toBe(22.5)
    expect(resolveEntranceRate({ eur_rate: '0' }, true)).toBe(0)
  })

  it('returns null for a missing fee row', () => {
    expect(resolveEntranceRate(null, true)).toBeNull()
    expect(resolveEntranceRate(undefined, false)).toBeNull()
  })
})
