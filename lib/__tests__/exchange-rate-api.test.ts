import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchExchangeRates,
  fetchAllExchangeRates,
  formatExchangeRate,
  getLastUpdateDisplay,
  ratesNeedRefresh,
} from '@/lib/exchange-rate-api'

// All network is stubbed — these tests must pass offline. The module logs
// via console.error on its throw paths; suppressed for clean output.

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function queueSuccess(conversionRates: Record<string, number>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: 'success', conversion_rates: conversionRates }),
  })
}

describe('fetchExchangeRates — endpoint selection', () => {
  it('uses the keyed v6 endpoint when an API key is provided', async () => {
    queueSuccess({ USD: 1.18, GBP: 0.87, EGP: 56.2 })
    await fetchExchangeRates('my-key')
    expect(fetchMock.mock.calls[0][0]).toBe('https://v6.exchangerate-api.com/v6/my-key/latest/EUR')
  })

  it('uses the free open endpoint when no key is provided', async () => {
    queueSuccess({ USD: 1.18, GBP: 0.87, EGP: 56.2 })
    await fetchExchangeRates()
    expect(fetchMock.mock.calls[0][0]).toBe('https://open.er-api.com/v6/latest/EUR')
  })

  it('honors a non-default base currency in the URL', async () => {
    queueSuccess({ EUR: 0.85 })
    await fetchExchangeRates('my-key', 'USD')
    expect(fetchMock.mock.calls[0][0]).toBe('https://v6.exchangerate-api.com/v6/my-key/latest/USD')
  })
})

describe('fetchExchangeRates — response handling', () => {
  it('returns one FetchedRate per supported currency, excluding the base', async () => {
    queueSuccess({ USD: 1.18, GBP: 0.87, EGP: 56.2, JPY: 160, EUR: 1 })
    const rates = await fetchExchangeRates('key')

    // EUR base excluded; unsupported JPY excluded.
    expect(rates.map(r => r.target_currency).sort()).toEqual(['EGP', 'GBP', 'USD'])
    const usd = rates.find(r => r.target_currency === 'USD')!
    expect(usd).toMatchObject({ base_currency: 'EUR', rate: 1.18 })
    expect(usd.fetched_at).toBeInstanceOf(Date)
    // All rows share one fetched_at timestamp.
    expect(new Set(rates.map(r => r.fetched_at.getTime())).size).toBe(1)
  })

  it('skips the requested base currency for non-EUR bases too', async () => {
    queueSuccess({ EUR: 0.85, GBP: 0.74, EGP: 47.5, USD: 1 })
    const rates = await fetchExchangeRates('key', 'USD')
    expect(rates.map(r => r.target_currency).sort()).toEqual(['EGP', 'EUR', 'GBP'])
    expect(rates.every(r => r.base_currency === 'USD')).toBe(true)
  })

  it('omits supported currencies missing from the response — no fabricated rows', async () => {
    queueSuccess({ USD: 1.18 }) // no GBP, no EGP
    const rates = await fetchExchangeRates('key')
    expect(rates.map(r => r.target_currency)).toEqual(['USD'])
  })

  it('throws on a non-ok HTTP response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(fetchExchangeRates('key')).rejects.toThrow('API request failed: 503')
  })

  it('throws on an API-level error result', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'error', 'error-type': 'invalid-key' }),
    })
    await expect(fetchExchangeRates('key')).rejects.toThrow('API error: invalid-key')
  })

  it('throws when a success response carries neither conversion_rates nor rates', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'success' }),
    })
    await expect(fetchExchangeRates('key')).rejects.toThrow('No conversion rates in API response')
  })

  it('accepts the keyless open-endpoint payload shape (`rates` key)', async () => {
    // open.er-api.com keys its table `rates`; the keyed v6 endpoint uses
    // `conversion_rates`. Both shapes must parse.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        base_code: 'EUR',
        rates: { USD: 1.18, GBP: 0.87, EGP: 56.2, JPY: 160 },
      }),
    })
    const rates = await fetchExchangeRates()
    expect(rates.map(r => r.target_currency).sort()).toEqual(['EGP', 'GBP', 'USD'])
    expect(rates.find(r => r.target_currency === 'USD')!.rate).toBe(1.18)
    expect(rates.every(r => r.base_currency === 'EUR')).toBe(true)
  })

  it('prefers conversion_rates when both keys are present', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        conversion_rates: { USD: 1.18 },
        rates: { USD: 9.99, GBP: 9.99 },
      }),
    })
    const rates = await fetchExchangeRates('key')
    expect(rates).toHaveLength(1)
    expect(rates[0]).toMatchObject({ target_currency: 'USD', rate: 1.18 })
  })
})

describe('fetchAllExchangeRates', () => {
  it('returns EUR-based rates plus computed reciprocal reverse rates', async () => {
    queueSuccess({ USD: 1.25, GBP: 0.8, EGP: 56 })
    const all = await fetchAllExchangeRates('key')

    // One network call; reverses are derived, not fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(all).toHaveLength(6)

    const usdToEur = all.find(r => r.base_currency === 'USD' && r.target_currency === 'EUR')!
    expect(usdToEur.rate).toBe(1 / 1.25)
    const egpToEur = all.find(r => r.base_currency === 'EGP' && r.target_currency === 'EUR')!
    expect(egpToEur.rate).toBeCloseTo(1 / 56, 12)

    // Forward and reverse are true reciprocals for every pair.
    for (const fwd of all.filter(r => r.base_currency === 'EUR')) {
      const rev = all.find(
        r => r.base_currency === fwd.target_currency && r.target_currency === 'EUR'
      )!
      expect(fwd.rate * rev.rate).toBeCloseTo(1, 12)
    }
  })

  it('propagates fetch failures instead of inventing rates', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(fetchAllExchangeRates('key')).rejects.toThrow('offline')
  })
})

describe('formatExchangeRate', () => {
  it('uses 2 decimals at >= 100', () => {
    expect(formatExchangeRate(100)).toBe('100.00')
    expect(formatExchangeRate(56.789)).not.toBe('56.79') // below 100 → 4dp
  })

  it('uses 4 decimals for 1 <= rate < 100', () => {
    expect(formatExchangeRate(1)).toBe('1.0000')
    expect(formatExchangeRate(56.789)).toBe('56.7890')
  })

  it('uses 6 decimals below 1', () => {
    expect(formatExchangeRate(0.87372)).toBe('0.873720')
    expect(formatExchangeRate(1 / 56)).toBe('0.017857')
  })
})

describe('getLastUpdateDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says "Just now" under a minute', () => {
    expect(getLastUpdateDisplay(new Date('2026-07-14T11:59:30Z'))).toBe('Just now')
  })

  it('reports minutes under an hour', () => {
    expect(getLastUpdateDisplay(new Date('2026-07-14T11:55:00Z'))).toBe('5 min ago')
    expect(getLastUpdateDisplay(new Date('2026-07-14T11:01:00Z'))).toBe('59 min ago')
  })

  it('reports hours under a day, singular and plural', () => {
    expect(getLastUpdateDisplay(new Date('2026-07-14T11:00:00Z'))).toBe('1 hour ago')
    expect(getLastUpdateDisplay(new Date('2026-07-14T09:00:00Z'))).toBe('3 hours ago')
  })

  it('reports days beyond 24 hours, singular and plural', () => {
    expect(getLastUpdateDisplay(new Date('2026-07-13T12:00:00Z'))).toBe('1 day ago')
    expect(getLastUpdateDisplay(new Date('2026-07-11T12:00:00Z'))).toBe('3 days ago')
  })
})

describe('ratesNeedRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is false while younger than the max age', () => {
    expect(ratesNeedRefresh(new Date('2026-07-14T11:00:00Z'))).toBe(false)
    expect(ratesNeedRefresh(new Date('2026-07-13T12:00:01Z'))).toBe(false)
  })

  it('is true at exactly the max age (inclusive boundary) and beyond', () => {
    expect(ratesNeedRefresh(new Date('2026-07-13T12:00:00Z'))).toBe(true)
    expect(ratesNeedRefresh(new Date('2026-07-10T12:00:00Z'))).toBe(true)
  })

  it('honors a custom max age', () => {
    expect(ratesNeedRefresh(new Date('2026-07-14T11:30:00Z'), 1)).toBe(false)
    expect(ratesNeedRefresh(new Date('2026-07-14T11:00:00Z'), 1)).toBe(true)
  })
})
