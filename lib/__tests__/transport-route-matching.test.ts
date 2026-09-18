import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { findTransportRate, buildTransportCache, INTERCITY_SERVICE_TYPES } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// ============================================
// A road transfer between cities prices, and prices its own route
// ============================================
// The engine asked for a service type called 'intercity_transfer'. Production
// holds NONE of those: the rows are intercity_dropoff (557), intercity_day_trip
// (313) and intercity_overnight (69) — the keys of the transport_service_type
// vocabulary. The lookup keys embed the service type, the approximate
// fallbacks included, so every road transfer between cities matched nothing
// and became a hole on every programme.
//
// And the direction: the rate form calls its first field "Departure City" and
// stores it in `city`, while the engine looks a day up by the day's ARRIVAL
// city. Matching on a single city would price a Luxor → Aswan rate for an
// Aswan → Luxor day and call it definite.

/** A row shaped like production's: departure in `city`, arrival in destination_city, origin_city NULL. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  service_type: 'intercity_dropoff',
  city: 'Luxor',
  origin_city: null,
  destination_city: 'Aswan',
  duration: null,
  area: null,
  vehicle_type: 'Minivan',
  base_rate_eur: 120,
  is_active: true,
  ...over,
})

/** The REAL cache, built by the engine from rows shaped like production's. */
async function cacheOf(rows: Array<Record<string, unknown>>) {
  setMockTables({ transportation_rates: rows } as never)
  return buildTransportCache({ tenantId: 'test-tenant' } as never)
}

const lookup = (cache: Awaited<ReturnType<typeof cacheOf>>, over: Record<string, unknown> = {}) =>
  findTransportRate(cache, {
    serviceType: 'intercity_dropoff',
    city: 'Aswan',
    duration: 'one_way',
    area: null as never,
    vehicleType: 'Minivan' as never,
    originCity: 'Luxor',
    destinationCity: 'Aswan',
    ...over,
  } as never)

describe('the intercity family', () => {
  it('is the three shapes the rates actually use', () => {
    expect([...INTERCITY_SERVICE_TYPES]).toEqual(['intercity_dropoff', 'intercity_day_trip', 'intercity_overnight'])
  })
})

describe('a Luxor → Aswan drop-off', () => {
  it('prices the day that travels it — this is what used to find nothing', async () => {
    const found = lookup(await cacheOf([row()]))
    expect(found?.source).toBe('db')
    expect(found?.rate.base_rate_eur).toBe(120)
  })

  it('is NOT used for the opposite direction', async () => {
    const found = lookup(await cacheOf([row()]), { city: 'Luxor', originCity: 'Aswan', destinationCity: 'Luxor' })
    expect(found).toBeNull()
  })

  it('is not used for a different city pair', async () => {
    expect(lookup(await cacheOf([row()]), { originCity: 'Cairo', destinationCity: 'Aswan' })).toBeNull()
  })

  it('is not used for another vehicle', async () => {
    expect(lookup(await cacheOf([row()]), { vehicleType: 'Bus' })).toBeNull()
  })

  it('never falls back to a nearby city, which would be a wrong route', async () => {
    // Luxor → Aswan on file; the day travels Cairo → Alexandria.
    expect(lookup(await cacheOf([row()]), { originCity: 'Cairo', destinationCity: 'Alexandria', city: 'Alexandria' })).toBeNull()
  })

  it('honours origin_city when a CSV import filled it in', async () => {
    const csvRow = row({ city: 'Somewhere else', origin_city: 'Luxor' })
    expect(lookup(await cacheOf([csvRow]))?.source).toBe('db')
  })

  it('works for the other two shapes as well', async () => {
    for (const service_type of ['intercity_day_trip', 'intercity_overnight']) {
      const found = lookup(await cacheOf([row({ service_type })]), { serviceType: service_type })
      expect(found?.source, service_type).toBe('db')
    }
  })
})

describe('the other service types keep their old matching', () => {
  it('a city transfer still matches by city, area and duration', async () => {
    const cache = await cacheOf([row({ service_type: 'city_transfer', city: 'Cairo', destination_city: null, duration: 'half_day' })])
    const found = findTransportRate(cache, {
      serviceType: 'city_transfer' as never,
      city: 'Cairo',
      duration: 'half_day' as never,
      area: null as never,
      vehicleType: 'Minivan' as never,
    } as never)
    expect(found?.source).toBe('db')
  })
})
