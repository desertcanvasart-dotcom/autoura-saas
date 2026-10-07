import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogScope } from '@/lib/catalog-scope'

// ============================================================================
// getAirportServiceRate — the query must PICK a price, not stumble into one.
//
// It filtered by airport and direction only, then took `.limit(1)` off an
// unordered result. Cairo arrival has four candidates:
//
//   meet_greet €15 · customs_assist €25 · full_service €40 · vip_service €75
//
// so the same trip could be priced anywhere across a 5x spread. It returned
// €15 only because that row happened to sit first on disk — a row rewrite or a
// different query plan would have changed the price with no code change and
// nothing to notice.
//
// These assert the two properties that make it deterministic: the service
// level is filtered, and ties are broken by an explicit order.
// ============================================================================

// getSupabaseAdmin() throws without these and the lookup's catch swallows it,
// so the mock below would never be reached and every assertion would fail on an
// empty call log rather than on the behaviour under test.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key'

type QueryBuilder = Record<string, (...args: unknown[]) => unknown>

const calls: Record<string, unknown[][]> = {}
let rows: Array<{ rate_eur: number; pricing_type?: string; max_capacity?: number | null }> = []

function chain(): QueryBuilder {
  const self: QueryBuilder = {}
  for (const m of ['select', 'or', 'eq', 'order', 'limit']) {
    self[m] = (...args: unknown[]) => {
      ;(calls[m] ??= []).push(args)
      return m === 'limit' ? Promise.resolve({ data: rows }) : self
    }
  }
  return self
}

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({ from: () => chain() }),
  createAuthenticatedClient: vi.fn(),
  requireAuth: vi.fn(),
  getUserTenantId: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => chain() }) }))

const SCOPE = { tenantId: 't1' } as unknown as CatalogScope

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k]
  rows = [{ rate_eur: 15 }]
})

describe('getAirportServiceRate', () => {
  it('filters by service_type — without it, every level competes', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'CAI', 'arrival')

    const eqArgs = (calls.eq ?? []).map(a => a[0])
    expect(eqArgs).toContain('service_type')
  })

  it('defaults to meet_greet — the level the engine has always charged', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'CAI', 'arrival')

    const st = (calls.eq ?? []).find(a => a[0] === 'service_type')
    expect(st?.[1]).toBe('meet_greet')
  })

  it('honours an explicit service level when one is asked for', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'CAI', 'arrival', 'vip_service')

    const st = (calls.eq ?? []).find(a => a[0] === 'service_type')
    expect(st?.[1]).toBe('vip_service')
  })

  it('orders before limiting, so a tie is never resolved by disk order', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'CAI', 'arrival')

    expect(calls.order).toBeDefined()
    expect(calls.order[0][0]).toBe('rate_eur')
    expect(calls.order[0][1]).toEqual({ ascending: true })
  })

  it('still filters airport and direction', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'LXR', 'departure')

    expect((calls.eq ?? []).find(a => a[0] === 'airport_code')?.[1]).toBe('LXR')
    expect(JSON.stringify(calls.or)).toContain('direction.eq.departure')
  })

  it('returns null when nothing matches, so the caller records a hole', async () => {
    rows = []
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    expect(await getAirportServiceRate(SCOPE, 'XXX', 'arrival')).toBeNull()
  })
})

// Migration 393: the rate says how it applies to the group.
describe('getAirportServiceRateDetail', () => {
  it('returns the rate with its pricing basis', async () => {
    rows = [{ rate_eur: 700, pricing_type: 'per_person' }]
    const { getAirportServiceRateDetail, getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    expect(await getAirportServiceRateDetail(SCOPE, 'ASW', 'arrival')).toEqual({ rate: 700, basis: 'per_person', capacity: null })
    // The number-only lookup is unchanged.
    expect(await getAirportServiceRate(SCOPE, 'ASW', 'arrival')).toBe(700)
  })

  it('a row that states nothing is per group; per unit keeps its capacity', async () => {
    const { getAirportServiceRateDetail } = await import('@/lib/auto-pricing-service')
    rows = [{ rate_eur: 15 }]
    expect(await getAirportServiceRateDetail(SCOPE, 'CAI', 'arrival')).toEqual({ rate: 15, basis: 'flat', capacity: null })
    rows = [{ rate_eur: 40, pricing_type: 'per_unit', max_capacity: 4 }]
    expect(await getAirportServiceRateDetail(SCOPE, 'CAI', 'arrival')).toEqual({ rate: 40, basis: 'per_unit', capacity: 4 })
  })
})
