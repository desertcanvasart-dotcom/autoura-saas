import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/fixed-costs.ts contract: fetch per-person-per-day fixed costs (water)
// from fixed_daily_costs, with a 5-minute in-memory cache. When the DB has no
// row / errors / is unreachable it falls back to the module's DOCUMENTED
// hardcoded default (Water Bottle = 2 — preserves the engine's previous
// hardcoded water cost; see DEFAULTS in the module). That fallback is a
// deliberate, documented operational default — locked here as such, NOT a
// silent fabrication.
//
// The module lazy-caches both the supabase client and the fetched costs, so
// every case re-imports with a fresh module registry and its own mock
// (same pattern as app/api/health/__tests__/health-route.test.ts).

type Row = { cost_type: string; cost_per_person_per_day: number | null }
type QueryResult = { data: Row[] | null; error: { message: string } | null }

const FAKE_URL = 'https://example.supabase.co'
const FAKE_KEY = 'service-role-key'

/**
 * Mock @supabase/supabase-js so each .eq() call consumes the next scripted
 * result (last one repeats). 'reject' simulates an unreachable DB. Returns a
 * counter so tests can assert how many queries actually hit the "DB".
 */
function mockSupabase(results: Array<QueryResult | 'reject'>) {
  const calls = { count: 0 }
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => {
            const r = results[Math.min(calls.count, results.length - 1)]
            calls.count += 1
            return r === 'reject'
              ? Promise.reject(new Error('ECONNREFUSED'))
              : Promise.resolve(r)
          },
        }),
      }),
    }),
  }))
  return calls
}

async function loadModule() {
  return import('../fixed-costs')
}

const waterRow = (rate: number | null): Row => ({
  cost_type: 'Water Bottle',
  cost_per_person_per_day: rate,
})

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('@supabase/supabase-js')
  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY
  // Fallback paths warn; keep test output clean and assert on the spy.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getFixedDailyCosts — DB values win', () => {
  it('returns the active DB rate when a Water Bottle row exists', async () => {
    mockSupabase([{ data: [waterRow(3.5)], error: null }])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 3.5 })
  })

  it('respects an explicit DB rate of 0 (real value, not replaced by the default)', async () => {
    mockSupabase([{ data: [waterRow(0)], error: null }])
    const { getFixedDailyCosts } = await loadModule()
    const costs = await getFixedDailyCosts()
    expect(costs.waterPerPersonPerDay).toBe(0)
  })

  it('ignores rows of other cost types when resolving water', async () => {
    mockSupabase([
      { data: [{ cost_type: 'Parking', cost_per_person_per_day: 99 }], error: null },
    ])
    const { getFixedDailyCosts } = await loadModule()
    const costs = await getFixedDailyCosts()
    expect(costs.waterPerPersonPerDay).toBe(2) // documented default, not 99
  })
})

describe('getFixedDailyCosts — missing/partial data falls back to the documented default (2)', () => {
  it('empty table → default', async () => {
    mockSupabase([{ data: [], error: null }])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 2 })
  })

  it('null data payload → default', async () => {
    mockSupabase([{ data: null, error: null }])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 2 })
  })

  it('row exists but cost_per_person_per_day is null → default (nullish, not falsy, coalescing)', async () => {
    mockSupabase([{ data: [waterRow(null)], error: null }])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 2 })
  })

  it('query error → default, and a warning is logged', async () => {
    mockSupabase([{ data: null, error: { message: 'permission denied' } }])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 2 })
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[FixedCosts]'),
      expect.stringContaining('permission denied')
    )
  })

  it('unreachable DB (client throws) → default, and a warning is logged', async () => {
    mockSupabase(['reject'])
    const { getFixedDailyCosts } = await loadModule()
    await expect(getFixedDailyCosts()).resolves.toEqual({ waterPerPersonPerDay: 2 })
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('getFixedDailyCosts — caching', () => {
  it('caches a successful fetch: second call does not re-query and ignores newer DB values', async () => {
    const calls = mockSupabase([
      { data: [waterRow(3)], error: null },
      { data: [waterRow(999)], error: null }, // would be returned only on a re-query
    ])
    const { getFixedDailyCosts } = await loadModule()
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(3)
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(3)
    expect(calls.count).toBe(1)
  })

  it('clearFixedCostsCache forces the next call to re-query', async () => {
    const calls = mockSupabase([
      { data: [waterRow(3)], error: null },
      { data: [waterRow(4.25)], error: null },
    ])
    const { getFixedDailyCosts, clearFixedCostsCache } = await loadModule()
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(3)
    clearFixedCostsCache()
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(4.25)
    expect(calls.count).toBe(2)
  })

  it('an error result is NOT cached — the next call retries and picks up real data', async () => {
    const calls = mockSupabase([
      { data: null, error: { message: 'timeout' } },
      { data: [waterRow(2.75)], error: null },
    ])
    const { getFixedDailyCosts } = await loadModule()
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(2) // fallback
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(2.75) // retried
    expect(calls.count).toBe(2)
  })

  it('an exception result is NOT cached either', async () => {
    const calls = mockSupabase(['reject', { data: [waterRow(5)], error: null }])
    const { getFixedDailyCosts } = await loadModule()
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(2)
    expect((await getFixedDailyCosts()).waterPerPersonPerDay).toBe(5)
    expect(calls.count).toBe(2)
  })
})
