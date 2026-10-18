import { describe, it, expect, beforeEach } from 'vitest'
import { ratesForTenant } from '@/lib/currency'
import { normalizeRateRows, clearFxCache } from '@/lib/rates/rate-currency'

// Exchange rates were read across companies: the service role saw every
// company's manual overrides and conversion took the first match for a pair.
const rows = [
  { tenant_id: null, base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true },
  { tenant_id: 'A', base_currency: 'EUR', target_currency: 'EGP', rate: 60, is_active: true },
  { tenant_id: 'B', base_currency: 'EUR', target_currency: 'EGP', rate: 999, is_active: true },
  { tenant_id: 'B', base_currency: 'EUR', target_currency: 'USD', rate: 7, is_active: true },
]

describe('ratesForTenant', () => {
  it('a company gets its own override over the shared rate', () => {
    expect(ratesForTenant(rows, 'A')).toEqual([rows[1]])
  })
  it('never another company’s rate — even for a pair the shared table lacks', () => {
    const forA = ratesForTenant(rows, 'A')
    expect(forA.some(r => r.rate === 999 || r.rate === 7)).toBe(false)
  })
  it('a company with no overrides gets the shared rates', () => {
    expect(ratesForTenant(rows, 'C')).toEqual([rows[0]])
  })
  it('no company: shared rates only', () => {
    expect(ratesForTenant(rows, null)).toEqual([rows[0]])
  })
  it('order does not matter', () => {
    expect(ratesForTenant([...rows].reverse(), 'A')).toEqual([rows[1]])
  })
})

describe('pricing conversion uses only the caller’s rates', () => {
  beforeEach(() => clearFxCache())
  const db = { from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }
  const price = async (tenant: string | null) =>
    (await normalizeRateRows(db, 'meal_rates', [{ id: 'm', rate_currency: 'EGP', base_rate_eur: 600 }], 'EUR', tenant))[0]

  it('company A converts 600 EGP with its own 60, company C with the shared 50', async () => {
    expect((await price('A')).base_rate_eur).toBeCloseTo(10)
    clearFxCache()
    expect((await price('C')).base_rate_eur).toBeCloseTo(12)
  })
  it('B’s 999 never prices anyone else', async () => {
    expect((await price('A')).base_rate_eur).not.toBeCloseTo(600 / 999)
  })
})
