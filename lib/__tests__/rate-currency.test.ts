import { describe, it, expect, beforeEach } from 'vitest'
import {
  createRateNormalizer,
  normalizeRateRows,
  clearFxCache,
  RATE_MONETARY_COLUMNS,
} from '../rates/rate-currency'
import type { ExchangeRate } from '../currency'

// P3: the fetch-boundary currency normalizer. What matters most:
//   1. Rows without a foreign rate_currency pass through BY REFERENCE —
//      a database without migration 295 behaves byte-identically.
//   2. NEVER-GUESS: an unconvertible currency nulls the money (missing-rate
//      hole) instead of pricing with a wrong number.

const FX: ExchangeRate[] = [
  // lib/currency semantics: EUR→EGP direct = 55, so EGP→EUR uses the inverse.
  { base_currency: 'EUR', target_currency: 'EGP', rate: 55, is_active: true } as ExchangeRate,
  { base_currency: 'USD', target_currency: 'EUR', rate: 0.9, is_active: true } as ExchangeRate,
]

describe('createRateNormalizer', () => {
  it('passes rows through by reference when rate_currency is absent, null, or EUR', () => {
    const { normalize, misses } = createRateNormalizer(FX)
    const rows = [
      { id: 'a', daily_rate: 100 },
      { id: 'b', daily_rate: 100, rate_currency: null },
      { id: 'c', daily_rate: 100, rate_currency: 'EUR' },
    ]
    const out = normalize('guides', rows as never[])
    expect(out[0]).toBe(rows[0])
    expect(out[1]).toBe(rows[1])
    expect(out[2]).toBe(rows[2])
    expect(misses).toEqual([])
  })

  it('converts a copy and never mutates the stored row', () => {
    const { normalize } = createRateNormalizer(FX)
    const row = { id: 'x', daily_rate: 5500, half_day_rate: null, rate_currency: 'EGP' }
    const [out] = normalize('guides', [row as never]) as Array<Record<string, unknown>>
    expect(out).not.toBe(row)
    expect(out.daily_rate).toBeCloseTo(100) // 5500 EGP / 55
    expect(out.rate_currency).toBe('EUR')   // the copy IS run-currency now
    expect(row.daily_rate).toBe(5500)       // original untouched
    expect(row.rate_currency).toBe('EGP')
  })

  it('converts USD via the direct rate', () => {
    const { normalize } = createRateNormalizer(FX)
    const [out] = normalize('meal_rates', [
      { id: 'm', base_rate_eur: 20, base_rate_non_eur: 22, minimum_pax: 4, rate_currency: 'USD' } as never,
    ]) as Array<Record<string, unknown>>
    expect(out.base_rate_eur).toBeCloseTo(18)
    expect(out.base_rate_non_eur).toBeCloseTo(19.8)
    expect(out.minimum_pax).toBe(4) // non-monetary column untouched
  })

  it('NEVER-GUESS: an unconvertible currency nulls the money and records a miss', () => {
    const { normalize, misses } = createRateNormalizer([]) // no rates at all
    const [out] = normalize('guides', [
      { id: 'g1', daily_rate: 5500, hourly_rate: 100, max_group_size: 10, rate_currency: 'EGP' } as never,
    ]) as Array<Record<string, unknown>>
    expect(out.daily_rate).toBeNull()
    expect(out.hourly_rate).toBeNull()
    expect(out.max_group_size).toBe(10)
    expect(misses).toHaveLength(1)
    expect(misses[0]).toMatchObject({ table: 'guides', rowId: 'g1', fromCurrency: 'EGP' })
  })

  it('leaves unknown tables completely alone', () => {
    const { normalize, misses } = createRateNormalizer(FX)
    const rows = [{ id: 'z', amount: 9, rate_currency: 'EGP' }]
    expect(normalize('not_a_rate_table', rows as never[])[0]).toBe(rows[0])
    expect(misses).toEqual([])
  })

  it('column map only names monetary columns (spot check)', () => {
    expect(RATE_MONETARY_COLUMNS.transportation_rates).not.toContain('capacity')
    expect(RATE_MONETARY_COLUMNS.flight_rates).not.toContain('duration_minutes')
    expect(RATE_MONETARY_COLUMNS.meal_rates).not.toContain('minimum_pax')
    expect(RATE_MONETARY_COLUMNS.accommodation_rates).not.toContain('star_rating')
  })
})

describe('normalizeRateRows (live wrapper)', () => {
  beforeEach(() => clearFxCache())

  const dbWith = (rates: ExchangeRate[], log: string[] = []) => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          log.push(table)
          return { data: rates, error: null }
        },
      }),
    }),
  })

  it('fast path: never touches the db when no row carries a foreign currency', async () => {
    const log: string[] = []
    const rows = [{ id: 'a', daily_rate: 10 }, { id: 'b', daily_rate: 20, rate_currency: 'EUR' }]
    const out = await normalizeRateRows(dbWith(FX, log), 'guides', rows as never[])
    expect(out).toBe(rows)
    expect(log).toEqual([])
  })

  it('loads fx once (cached) and converts foreign rows', async () => {
    const log: string[] = []
    const db = dbWith(FX, log)
    const [a] = await normalizeRateRows(db, 'guides', [
      { id: 'a', daily_rate: 5500, rate_currency: 'EGP' } as never,
    ]) as Array<Record<string, unknown>>
    const [b] = await normalizeRateRows(db, 'guides', [
      { id: 'b', daily_rate: 110, rate_currency: 'EGP' } as never,
    ]) as Array<Record<string, unknown>>
    expect(a.daily_rate).toBeCloseTo(100)
    expect(b.daily_rate).toBeCloseTo(2)
    expect(log).toEqual(['exchange_rates']) // second call served from cache
  })

  it('a broken exchange-rates read degrades to missing rates, never a throw', async () => {
    const broken = { from: () => { throw new Error('boom') } }
    const [out] = await normalizeRateRows(broken, 'guides', [
      { id: 'a', daily_rate: 5500, rate_currency: 'EGP' } as never,
    ]) as Array<Record<string, unknown>>
    expect(out.daily_rate).toBeNull()
  })

  it('handles null/empty row sets', async () => {
    expect(await normalizeRateRows(dbWith(FX), 'guides', null)).toEqual([])
    expect(await normalizeRateRows(dbWith(FX), 'guides', [])).toEqual([])
  })
})

describe('dated rate periods under a foreign contract currency (C3.2 × P3)', () => {
  it('converts the rates INSIDE seasons, not just the flat columns', () => {
    const { normalize } = createRateNormalizer(FX)
    const [out] = normalize('accommodation_rates', [{
      id: 'h1',
      rate_currency: 'EGP',
      ppd_eur: 5500,
      seasons: [
        { name: 'Christmas', from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 11000, single_supplement_eur: 2750 } },
      ],
    } as never]) as Array<Record<string, unknown>>
    expect(out.ppd_eur).toBeCloseTo(100)
    const seasons = out.seasons as Array<{ rates: Record<string, number> }>
    expect(seasons[0].rates.ppd_eur).toBeCloseTo(200)
    expect(seasons[0].rates.single_supplement_eur).toBeCloseTo(50)
  })

  it('an unconvertible currency nulls the periods too — no priceable windows survive', () => {
    const { normalize } = createRateNormalizer([])
    const [out] = normalize('accommodation_rates', [{
      id: 'h2',
      rate_currency: 'EGP',
      ppd_eur: 5500,
      seasons: [{ name: 'X', from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 11000 } }],
    } as never]) as Array<Record<string, unknown>>
    expect(out.ppd_eur).toBeNull()
    expect(out.seasons).toBeNull()
  })

  it('leaves a non-array seasons value untouched rather than mangling it', () => {
    const { normalize } = createRateNormalizer(FX)
    const [out] = normalize('accommodation_rates', [
      { id: 'h3', rate_currency: 'EGP', ppd_eur: 5500, seasons: null } as never,
    ]) as Array<Record<string, unknown>>
    expect(out.seasons).toBeNull()
  })
})
