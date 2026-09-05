import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogScope } from '@/lib/catalog-scope'

// ============================================================================
// Check-out assistance is its own hotel-service type (A-item 19)
//
// Check-out used to be conflated with the porter row — the engine
// hard-defaulted to 'porter' (whose data means luggage-only) and the label
// papered over it ("Check-out & Porter"). checkout_assist is a real type
// now, and the engine asks for it FIRST, falling back to the legacy rows
// (porter, then full_service) so a tenant whose table predates the type
// keeps pricing check-out days instead of holing them.
// ============================================================================

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key'

type QueryBuilder = Record<string, (...args: unknown[]) => unknown>

// Rows keyed by service_type; the chain records which type each lookup
// filtered on and answers from that bucket.
let byType: Record<string, Array<{ rate_eur: number }>> = {}
let asked: string[] = []

function chain(): QueryBuilder {
  const self: QueryBuilder = {}
  let requestedType = ''
  for (const m of ['select', 'or', 'eq', 'order', 'limit']) {
    self[m] = (...args: unknown[]) => {
      if (m === 'eq' && args[0] === 'service_type') {
        requestedType = String(args[1])
        asked.push(requestedType)
      }
      return m === 'limit' ? Promise.resolve({ data: byType[requestedType] ?? [] }) : self
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
  byType = {}
  asked = []
})

describe('getHotelServiceRate — checkout_assist', () => {
  it('prices from a real checkout_assist row when one exists', async () => {
    const { getHotelServiceRate } = await import('@/lib/auto-pricing-service')
    byType = { checkout_assist: [{ rate_eur: 12 }], porter: [{ rate_eur: 8 }] }
    expect(await getHotelServiceRate(SCOPE, 'checkout_assist', 'standard')).toBe(12)
    expect(asked[0]).toBe('checkout_assist')
  })

  it('falls back to the legacy porter row, then full_service', async () => {
    const { getHotelServiceRate } = await import('@/lib/auto-pricing-service')
    byType = { porter: [{ rate_eur: 8 }] }
    expect(await getHotelServiceRate(SCOPE, 'checkout_assist', 'standard')).toBe(8)
    expect(asked).toEqual(['checkout_assist', 'porter'])

    asked = []
    byType = { full_service: [{ rate_eur: 20 }] }
    expect(await getHotelServiceRate(SCOPE, 'checkout_assist', 'standard')).toBe(20)
    expect(asked).toEqual(['checkout_assist', 'porter', 'full_service'])
  })

  it('no row of any accepted shape is a null (a hole), never a guess', async () => {
    const { getHotelServiceRate } = await import('@/lib/auto-pricing-service')
    byType = { concierge: [{ rate_eur: 99 }] }
    expect(await getHotelServiceRate(SCOPE, 'checkout_assist', 'standard')).toBeNull()
  })

  it('other levels do NOT inherit the fallback chain', async () => {
    const { getHotelServiceRate } = await import('@/lib/auto-pricing-service')
    byType = { porter: [{ rate_eur: 8 }] }
    expect(await getHotelServiceRate(SCOPE, 'checkin_assist', 'standard')).toBeNull()
    expect(asked).toEqual(['checkin_assist'])
  })
})
