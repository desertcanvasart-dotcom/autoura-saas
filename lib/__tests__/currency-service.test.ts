import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  convertCurrency,
  formatCurrency,
  getCurrencySymbol,
  getExchangeRate,
  getFallbackRates,
  persistExchangeRate,
  buildSnapshotRows,
  type ExchangeRates,
} from '@/lib/currency-service'

// LOCKED POLICY (commit 6e83b29): convertCurrency returns null when no rate
// exists — NEVER the unconverted amount passed off as converted.
//
// fetchExchangeRates has module-level cache state, so those tests re-import
// the module with a fresh registry per test (same pattern as
// app/api/health/__tests__/health-route.test.ts).

function eurRates(overrides?: Partial<ExchangeRates>): ExchangeRates {
  return {
    base: 'EUR',
    date: '2026-07-14',
    rates: { EUR: 1, USD: 1.2, GBP: 0.8, EGP: 56 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('convertCurrency — never fabricates', () => {
  it('same currency is identity, regardless of the rates table', () => {
    const empty: ExchangeRates = { base: 'EUR', date: '2026-07-14', rates: {} }
    expect(convertCurrency(123.45, 'USD', 'USD', empty)).toBe(123.45)
    expect(convertCurrency(0, 'EGP', 'EGP', empty)).toBe(0)
    expect(convertCurrency(-9, 'GBP', 'GBP', empty)).toBe(-9)
  })

  it('multiplies when the table base IS the source currency', () => {
    expect(convertCurrency(10, 'EUR', 'EGP', eurRates())).toBe(560)
    expect(convertCurrency(100, 'EUR', 'USD', eurRates())).toBeCloseTo(120, 10)
  })

  it('divides when the table base IS the target currency (reverse math)', () => {
    // Only EUR-based rates exist; EGP→EUR must be amount / rate.
    expect(convertCurrency(112, 'EGP', 'EUR', eurRates())).toBe(2)
    expect(convertCurrency(120, 'USD', 'EUR', eurRates())).toBeCloseTo(100, 10)
  })

  it('cross-converts through the base when neither side is the base', () => {
    // USD→EGP via EUR: 120 USD → 100 EUR → 5600 EGP.
    expect(convertCurrency(120, 'USD', 'EGP', eurRates())).toBeCloseTo(5600, 8)
    // And back: 5600 EGP → 100 EUR → 120 USD.
    expect(convertCurrency(5600, 'EGP', 'USD', eurRates())).toBeCloseTo(120, 8)
  })

  it('LOCK: returns null when no rate exists — never the unconverted amount', () => {
    // 1000 EGP rendered as €1,000 would be a ~53× error.
    expect(convertCurrency(1000, 'EGP', 'JPY', eurRates())).toBeNull()
    expect(convertCurrency(1000, 'JPY', 'EGP', eurRates())).toBeNull()
    const empty: ExchangeRates = { base: 'EUR', date: '2026-07-14', rates: {} }
    expect(convertCurrency(1000, 'EGP', 'USD', empty)).toBeNull()
  })

  it('treats a 0 rate as missing and returns null (falsy guard — safe, no fabrication)', () => {
    const rates = eurRates({ rates: { EUR: 1, USD: 0 } })
    expect(convertCurrency(100, 'EUR', 'USD', rates)).toBeNull()
    expect(convertCurrency(100, 'USD', 'EUR', rates)).toBeNull()
  })

  it('handles zero and negative amounts arithmetically', () => {
    expect(convertCurrency(0, 'EUR', 'EGP', eurRates())).toBe(0)
    expect(convertCurrency(-10, 'EUR', 'EGP', eurRates())).toBe(-560)
    expect(convertCurrency(-56, 'EGP', 'EUR', eurRates())).toBe(-1)
  })
})

describe('getExchangeRate', () => {
  it('same currency is 1', () => {
    expect(getExchangeRate('USD', 'USD', eurRates())).toBe(1)
  })

  it('direct rate when base is the source', () => {
    expect(getExchangeRate('EUR', 'EGP', eurRates())).toBe(56)
  })

  it('reciprocal when base is the target', () => {
    expect(getExchangeRate('EGP', 'EUR', eurRates())).toBe(1 / 56)
  })

  it('cross rate through the base', () => {
    expect(getExchangeRate('USD', 'EGP', eurRates())).toBeCloseTo(56 / 1.2, 10)
  })

  it('returns null when a side is missing — never 1, never a guess', () => {
    expect(getExchangeRate('EUR', 'JPY', eurRates())).toBeNull()
    expect(getExchangeRate('JPY', 'EUR', eurRates())).toBeNull()
    expect(getExchangeRate('JPY', 'CHF', eurRates())).toBeNull()
  })
})

describe('formatCurrency / getCurrencySymbol', () => {
  it('formats with symbol and 2 decimals by default', () => {
    expect(formatCurrency(1234.567, 'USD')).toBe('$1,234.57')
    expect(formatCurrency(1000, 'EGP')).toBe('E£1,000.00')
  })

  it('respects showSymbol=false and custom decimals', () => {
    expect(formatCurrency(1234.5, 'EUR', { showSymbol: false })).toBe('1,234.50')
    expect(formatCurrency(1234.5, 'GBP', { decimals: 0 })).toBe('£1,235')
  })

  it('unknown currency falls back to the raw code (no invented symbol)', () => {
    expect(formatCurrency(50, 'JPY')).toBe('JPY50.00')
    expect(getCurrencySymbol('JPY')).toBe('JPY')
    expect(getCurrencySymbol('EGP')).toBe('E£')
  })

  it('formats zero and negatives', () => {
    expect(formatCurrency(0, 'EUR')).toBe('€0.00')
    expect(formatCurrency(-42.5, 'USD')).toBe('$-42.50')
  })
})

describe('getFallbackRates', () => {
  it('EUR base returns the pinned EUR reference rates', () => {
    const fb = getFallbackRates('EUR')
    expect(fb.base).toBe('EUR')
    expect(fb.rates).toEqual({ EUR: 1, USD: 1.1782, GBP: 0.8737, EGP: 56.0 })
  })

  it('rebases correctly for a supported non-EUR base', () => {
    const fb = getFallbackRates('USD')
    expect(fb.base).toBe('USD')
    expect(fb.rates.USD).toBe(1)
    expect(fb.rates.EUR).toBeCloseTo(1 / 1.1782, 10)
    expect(fb.rates.EGP).toBeCloseTo(56 / 1.1782, 10)
  })

  it('LOCK: unknown base returns an identity-only table — never relabeled EUR magnitudes', () => {
    // A base outside the pinned table cannot be re-based honestly, so the
    // fallback is { JPY: 1 } only. Downstream conversions against it resolve
    // to null (convertCurrency's no-rate contract) instead of a wrong number.
    const fb = getFallbackRates('JPY')
    expect(fb.base).toBe('JPY')
    expect(fb.rates).toEqual({ JPY: 1 })
  })

  it('LOCK: converting against an identity-only fallback returns null, not a fabricated amount', () => {
    const fb = getFallbackRates('JPY')
    expect(convertCurrency(1000, 'JPY', 'EUR', fb)).toBeNull()
    expect(convertCurrency(1000, 'EUR', 'JPY', fb)).toBeNull()
    // Same-currency identity still holds.
    expect(convertCurrency(1000, 'JPY', 'JPY', fb)).toBe(1000)
  })
})

describe('fetchExchangeRates — cache and fallback', () => {
  const fetchMock = vi.fn()

  function queueSuccess(base: string, rates: Record<string, number>) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        base_code: base,
        time_last_update_utc: 'Tue, 14 Jul 2026 00:02:31 +0000',
        rates,
      }),
    })
  }

  async function loadService() {
    vi.resetModules()
    return import('@/lib/currency-service')
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T10:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('parses a successful response, includes the base at rate 1, dates it, and clears the fallback flag', async () => {
    const svc = await loadService()
    queueSuccess('USD', { EUR: 0.85, GBP: 0.74, EGP: 47.5 })
    const result = await svc.fetchExchangeRates('USD')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://open.er-api.com/v6/latest/USD')
    expect(result.base).toBe('USD')
    expect(result.rates.USD).toBe(1)
    expect(result.rates.EGP).toBe(47.5)
    expect(result.date).toBe('2026-07-14')
    expect(svc.isUsingFallbackRates()).toBe(false)
  })

  it('serves the cache within 1 hour for the same base (single fetch)', async () => {
    const svc = await loadService()
    queueSuccess('USD', { EUR: 0.85 })
    const first = await svc.fetchExchangeRates('USD')

    vi.advanceTimersByTime(59 * 60 * 1000)
    const second = await svc.fetchExchangeRates('USD')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('refetches after the 1-hour cache expires', async () => {
    const svc = await loadService()
    queueSuccess('USD', { EUR: 0.85 })
    await svc.fetchExchangeRates('USD')

    vi.advanceTimersByTime(61 * 60 * 1000)
    queueSuccess('USD', { EUR: 0.9 })
    const refreshed = await svc.fetchExchangeRates('USD')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshed.rates.EUR).toBe(0.9)
  })

  it('a different base bypasses the cache', async () => {
    const svc = await loadService()
    queueSuccess('USD', { EUR: 0.85 })
    await svc.fetchExchangeRates('USD')
    queueSuccess('EUR', { USD: 1.18 })
    const eur = await svc.fetchExchangeRates('EUR')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(eur.base).toBe('EUR')
  })

  it('network failure falls back to the pinned rates, flags it, and does NOT poison the cache', async () => {
    const svc = await loadService()
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const fb = await svc.fetchExchangeRates('EUR')

    expect(fb.rates).toEqual({ EUR: 1, USD: 1.1782, GBP: 0.8737, EGP: 56.0 })
    expect(svc.isUsingFallbackRates()).toBe(true)

    // The fallback must not be cached: the next call retries the network.
    queueSuccess('EUR', { USD: 1.18, GBP: 0.87, EGP: 56.2 })
    const live = await svc.fetchExchangeRates('EUR')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(live.rates.USD).toBe(1.18)
    expect(svc.isUsingFallbackRates()).toBe(false)
  })

  it('non-ok HTTP response falls back', async () => {
    const svc = await loadService()
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: 'Service Unavailable' })
    const fb = await svc.fetchExchangeRates('EUR')
    expect(fb.base).toBe('EUR')
    expect(svc.isUsingFallbackRates()).toBe(true)
  })

  it('API-level error result falls back', async () => {
    const svc = await loadService()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'error', 'error-type': 'invalid-key' }),
    })
    const fb = await svc.fetchExchangeRates('EUR')
    expect(fb.rates.EGP).toBe(56.0)
    expect(svc.isUsingFallbackRates()).toBe(true)
  })
})

describe('persistExchangeRate', () => {
  it('inserts a snapshot row with the default source', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn(() => ({ insert })) }

    await persistExchangeRate(supabase, 'EUR', 'USD', 1.1782)

    expect(supabase.from).toHaveBeenCalledWith('exchange_rate_snapshots')
    expect(insert).toHaveBeenCalledWith({
      base_currency: 'EUR',
      target_currency: 'USD',
      rate: 1.1782,
      source: 'er-api',
    })
  })

  it('passes an explicit source through', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: () => ({ insert }) }

    await persistExchangeRate(supabase, 'EUR', 'EGP', 56, 'manual-override')

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual-override' })
    )
  })

  it('swallows insert failures (persistence is best-effort)', async () => {
    const supabase = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) }
    await expect(persistExchangeRate(supabase, 'EUR', 'USD', 1.1)).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

// The payload the daily refresh cron writes into exchange_rate_snapshots.
// This history is what the P&L, analytics and financial reports convert
// against, so a bad row here quietly corrupts margins for as long as it sits
// in the table.
describe('buildSnapshotRows', () => {
  const AT = '2026-07-26T01:00:00.000Z'

  const fetched = [
    { base_currency: 'EUR', target_currency: 'USD', rate: 1.08 },
    { base_currency: 'EUR', target_currency: 'EGP', rate: 53.5 },
    { base_currency: 'USD', target_currency: 'EUR', rate: 0.926 },
  ]

  it('maps fetched rates onto snapshot rows', () => {
    const rows = buildSnapshotRows(fetched, AT)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      base_currency: 'EUR',
      target_currency: 'USD',
      rate: 1.08,
      source: 'er-api',
      captured_at: AT,
    })
  })

  it('stamps every row in a batch with the same instant', () => {
    // The UNIQUE(base, target, captured_at) constraint is what makes a
    // double-run idempotent — that only works if the batch shares a timestamp.
    const rows = buildSnapshotRows(fetched, AT)
    expect(new Set(rows.map(r => r.captured_at)).size).toBe(1)
  })

  it('drops rates that would poison the history', () => {
    const rows = buildSnapshotRows(
      [
        { base_currency: 'EUR', target_currency: 'EGP', rate: 0 },
        { base_currency: 'EUR', target_currency: 'USD', rate: -1 },
        { base_currency: 'EUR', target_currency: 'GBP', rate: NaN },
        { base_currency: 'EUR', target_currency: 'JPY', rate: Infinity },
      ],
      AT
    )
    expect(rows).toEqual([])
  })

  it('drops rows with a missing or self-referential pair', () => {
    const rows = buildSnapshotRows(
      [
        { base_currency: '', target_currency: 'EGP', rate: 50 },
        { base_currency: 'EUR', target_currency: '', rate: 50 },
        { base_currency: 'EUR', target_currency: 'EUR', rate: 1 },
      ],
      AT
    )
    expect(rows).toEqual([])
  })

  it('keeps only the first of a duplicated pair, so the insert cannot self-collide', () => {
    const rows = buildSnapshotRows(
      [
        { base_currency: 'EUR', target_currency: 'EGP', rate: 53.5 },
        { base_currency: 'EUR', target_currency: 'EGP', rate: 54.0 },
      ],
      AT
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].rate).toBe(53.5)
  })

  it('normalises currency case', () => {
    const rows = buildSnapshotRows([{ base_currency: 'eur', target_currency: 'egp', rate: 53.5 }], AT)
    expect(rows[0].base_currency).toBe('EUR')
    expect(rows[0].target_currency).toBe('EGP')
  })

  it('accepts an explicit source label', () => {
    const rows = buildSnapshotRows(fetched, AT, 'manual')
    expect(rows.every(r => r.source === 'manual')).toBe(true)
  })

  it('tolerates an empty or nullish batch', () => {
    expect(buildSnapshotRows([], AT)).toEqual([])
    expect(buildSnapshotRows(null as never, AT)).toEqual([])
  })
})
