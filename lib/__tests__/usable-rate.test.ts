// A rate table with a blank cell must read as "no answer", never as "free" —
// the shape that let a 400 guide line convert into a 0 quote line.
// Ported from travel-ops-pro (__tests__/lib/usable-rate.test.ts).

import { describe, it, expect } from 'vitest'
import { usableRate } from '@/lib/pricing/usable-rate'

describe('usableRate', () => {
  it('passes a rate somebody actually set', () => {
    expect(usableRate(50)).toBe(50)
    expect(usableRate('50.5')).toBe(50.5)
  })

  it('treats an unfilled cell as no answer, not as free', () => {
    expect(usableRate(null)).toBeNull()
    expect(usableRate(undefined)).toBeNull()
    expect(usableRate('')).toBeNull()
    expect(usableRate(0)).toBeNull()
  })

  it('refuses a negative rate, which is a data error rather than a discount', () => {
    expect(usableRate(-25)).toBeNull()
  })

  it('refuses anything that is not a number', () => {
    expect(usableRate('per person')).toBeNull()
    expect(usableRate(NaN)).toBeNull()
    expect(usableRate(Infinity)).toBeNull()
    expect(usableRate({})).toBeNull()
  })
})
