import { describe, it, expect } from 'vitest'
import { resolveMarginPercent } from '@/lib/pricing/resolve-margin'
import { DEFAULT_MARGIN_PERCENT } from '@/lib/ai/parsing-utils'

// Check 11. The order matters, but the 0 cases are the ones that were losing
// money: `0 || 25` resold an at-cost trip at 25%, and the user-preferences
// save route wrote 25 to the profile of anyone who chose 0.

describe('resolveMarginPercent', () => {
  it('prefers an explicit value over everything', () => {
    expect(resolveMarginPercent({ explicit: 12, userDefault: 30, tenantDefault: 40 }))
      .toEqual({ marginPercent: 12, source: 'explicit' })
  })

  it('falls back to the user preference, then the tenant, then the constant', () => {
    expect(resolveMarginPercent({ userDefault: 30, tenantDefault: 40 }))
      .toEqual({ marginPercent: 30, source: 'user' })
    expect(resolveMarginPercent({ tenantDefault: 40 }))
      .toEqual({ marginPercent: 40, source: 'tenant' })
    expect(resolveMarginPercent({}))
      .toEqual({ marginPercent: DEFAULT_MARGIN_PERCENT, source: 'constant' })
  })

  it('treats an explicit 0 as a real at-cost margin, NOT as absent', () => {
    expect(resolveMarginPercent({ explicit: 0, userDefault: 30 }))
      .toEqual({ marginPercent: 0, source: 'explicit' })
  })

  it('treats a user or tenant 0 as a real choice too', () => {
    expect(resolveMarginPercent({ userDefault: 0, tenantDefault: 40 }))
      .toEqual({ marginPercent: 0, source: 'user' })
    expect(resolveMarginPercent({ tenantDefault: 0 }))
      .toEqual({ marginPercent: 0, source: 'tenant' })
  })

  it('lets a cleared personal margin fall through to the house rate', () => {
    // The point of a company default: clear yours, follow the company.
    expect(resolveMarginPercent({ userDefault: null, tenantDefault: 30 }))
      .toEqual({ marginPercent: 30, source: 'tenant' })
  })

  it('ignores unusable values rather than pricing from them', () => {
    for (const bad of ['', 'abc', NaN, Infinity, null, undefined]) {
      expect(resolveMarginPercent({ explicit: bad as never, tenantDefault: 30 }).source).toBe('tenant')
    }
  })

  it('refuses a negative margin — a typo must not sell below cost', () => {
    expect(resolveMarginPercent({ explicit: -10, tenantDefault: 30 }))
      .toEqual({ marginPercent: 30, source: 'tenant' })
  })

  it('accepts numeric strings, which is how postgres numerics arrive', () => {
    expect(resolveMarginPercent({ tenantDefault: '30.00' }))
      .toEqual({ marginPercent: 30, source: 'tenant' })
    expect(resolveMarginPercent({ tenantDefault: '0' }))
      .toEqual({ marginPercent: 0, source: 'tenant' })
  })
})
