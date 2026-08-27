import { describe, it, expect, beforeEach } from 'vitest'
import { getTenantRunCurrency, clearRunCurrencyCache, DEFAULT_RUN_CURRENCY } from '../rates/run-currency'
import { createRateNormalizer, normalizeRateRows, clearFxCache } from '../rates/rate-currency'
import { convertCurrency, type ExchangeRate } from '../currency'
import { computeFxReprice } from '../itinerary-fx'

// C3.4: the tenant's run currency. What matters: absent column / missing
// tenant / any failure = EUR (historical behaviour, byte-identical), the
// EUR-leg cross rate makes non-EUR run currencies actually computable from
// the EUR-pair-only exchange_rates table, and the whole conversion chain
// honours the parameter.

const FX: ExchangeRate[] = [
  { base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true } as ExchangeRate,
  { base_currency: 'EUR', target_currency: 'USD', rate: 1.25, is_active: true } as ExchangeRate,
]

const dbReturning = (row: unknown) => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
  }),
})

describe('getTenantRunCurrency', () => {
  beforeEach(() => clearRunCurrencyCache())

  it('reads the setting, defaults to EUR on null/absent column/missing row/error', async () => {
    expect(await getTenantRunCurrency(dbReturning({ id: 't', rates_currency: 'USD' }), 't')).toBe('USD')
    clearRunCurrencyCache()
    expect(await getTenantRunCurrency(dbReturning({ id: 't', rates_currency: null }), 't')).toBe(DEFAULT_RUN_CURRENCY)
    clearRunCurrencyCache()
    expect(await getTenantRunCurrency(dbReturning({ id: 't' }), 't')).toBe(DEFAULT_RUN_CURRENCY) // pre-migration row
    clearRunCurrencyCache()
    expect(await getTenantRunCurrency(dbReturning(null), 't')).toBe(DEFAULT_RUN_CURRENCY)
    clearRunCurrencyCache()
    const broken = { from: () => { throw new Error('boom') } }
    expect(await getTenantRunCurrency(broken, 't')).toBe(DEFAULT_RUN_CURRENCY)
  })

  it('caches per tenant', async () => {
    let reads = 0
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: { rates_currency: 'EGP' } } } }) }),
      }),
    }
    expect(await getTenantRunCurrency(db, 't1')).toBe('EGP')
    expect(await getTenantRunCurrency(db, 't1')).toBe('EGP')
    expect(reads).toBe(1)
  })
})

describe('cross rate via EUR legs', () => {
  it('EGP→USD works from EUR-pair-only rates', () => {
    // 500 EGP → 10 EUR → 12.5 USD
    expect(convertCurrency(500, 'EGP', 'USD', FX)).toBeCloseTo(12.5)
  })

  it('still null when a leg is missing', () => {
    expect(convertCurrency(100, 'EGP', 'GBP', FX)).toBeNull()
  })
})

describe('run currency through the conversion chain', () => {
  beforeEach(() => clearFxCache())

  it('normalizer converts an EGP-priced rate into a USD run currency', () => {
    const { normalize } = createRateNormalizer(FX, 'USD')
    const [out] = normalize('guides', [
      { id: 'g', daily_rate: 500, rate_currency: 'EGP' } as never,
    ]) as Array<Record<string, unknown>>
    expect(out.daily_rate).toBeCloseTo(12.5)
    expect(out.rate_currency).toBe('USD')
  })

  it('a USD-priced row passes by reference when the run currency IS USD', async () => {
    const rows = [{ id: 'a', daily_rate: 10, rate_currency: 'USD' }]
    const out = await normalizeRateRows({ from: () => { throw new Error('must not read fx') } }, 'guides', rows as never[], 'USD')
    expect(out).toBe(rows)
  })

  it('computeFxReprice restates into the given base', () => {
    const { patches } = computeFxReprice(
      [{ id: 's', supplier_currency: 'EGP', supplier_cost_original: 500, quantity: 1 }],
      FX as never[],
      'USD'
    )
    expect(patches[0].unit_cost).toBeCloseTo(12.5)
  })

  it('a base-currency line is untouched under a non-EUR base', () => {
    const result = computeFxReprice(
      [{ id: 's', supplier_currency: 'USD', supplier_cost_original: 99 }],
      FX as never[],
      'USD'
    )
    expect(result.patches).toHaveLength(0)
    expect(result.untouched).toBe(1)
  })
})

describe('widened currency vocabulary (C3.4c)', () => {
  it('one canonical list, MEA currencies included, symbols/names complete', async () => {
    const { SUPPORTED_CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_NAMES } = await import('../currency')
    for (const c of ['EUR', 'USD', 'GBP', 'EGP', 'AED', 'SAR', 'JOD', 'MAD', 'TND', 'KES', 'TZS', 'ZAR']) {
      expect(SUPPORTED_CURRENCIES).toContain(c)
    }
    for (const c of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_SYMBOLS[c], `symbol for ${c}`).toBeTruthy()
      expect(CURRENCY_NAMES[c], `name for ${c}`).toBeTruthy()
    }
  })

  it('a JOD-priced rate converts into a USD run currency via EUR legs', () => {
    const rates = [
      { base_currency: 'EUR', target_currency: 'JOD', rate: 0.8, is_active: true },
      { base_currency: 'EUR', target_currency: 'USD', rate: 1.25, is_active: true },
    ] as never[]
    const { normalize } = createRateNormalizer(rates, 'USD')
    const [out] = normalize('guides', [
      { id: 'g', daily_rate: 80, rate_currency: 'JOD' } as never,
    ]) as Array<Record<string, unknown>>
    // 80 JOD → 100 EUR → 125 USD
    expect(out.daily_rate).toBeCloseTo(125)
  })
})
