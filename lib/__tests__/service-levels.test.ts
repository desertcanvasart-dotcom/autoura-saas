import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogScope } from '@/lib/catalog-scope'

// ============================================================================
// Service levels — 21 priced rate rows that nothing could ask for.
//
// hotel_staff_rates carries checkin_assist, porter, full_service and
// concierge; airport_staff_rates carries meet_greet, customs_assist,
// full_service and vip_service. day.services had only booleans, so the engine
// could only ever request checkin_assist, porter and (after the ordering fix)
// meet_greet. The other 21 rows — EUR 3 to EUR 75 — were catalogue nobody
// could sell.
//
// The levels are OPTIONAL and each falls back to what has always been charged,
// so the thing these mostly guard is that the defaults never drift: a silent
// change there reprices every existing itinerary.
// ============================================================================

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key'

type QueryBuilder = Record<string, (...args: unknown[]) => unknown>
const calls: Record<string, unknown[][]> = {}
let rows: Array<{ rate_eur: number }> = []

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
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => chain() }) }))

const SCOPE = { tenantId: 't1' } as unknown as CatalogScope
beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k]
  rows = [{ rate_eur: 25 }]
})
const askedFor = () => (calls.eq ?? []).find(a => a[0] === 'service_type')?.[1]

describe('airport service levels', () => {
  it('every level the rate table stores is requestable', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    for (const lvl of ['meet_greet', 'customs_assist', 'full_service', 'vip_service'] as const) {
      for (const k of Object.keys(calls)) delete calls[k]
      await getAirportServiceRate(SCOPE, 'CAI', 'arrival', lvl)
      expect(askedFor()).toBe(lvl)
    }
  })

  it('still defaults to meet_greet — changing this reprices every itinerary', async () => {
    const { getAirportServiceRate } = await import('@/lib/auto-pricing-service')
    await getAirportServiceRate(SCOPE, 'CAI', 'arrival')
    expect(askedFor()).toBe('meet_greet')
  })
})

describe('hotel service levels', () => {
  it('every level the rate table stores is requestable', async () => {
    const { getHotelServiceRate } = await import('@/lib/auto-pricing-service')
    for (const lvl of ['checkin_assist', 'porter', 'full_service', 'concierge'] as const) {
      for (const k of Object.keys(calls)) delete calls[k]
      await getHotelServiceRate(SCOPE, lvl, 'standard')
      expect(askedFor()).toBe(lvl)
    }
  })
})
