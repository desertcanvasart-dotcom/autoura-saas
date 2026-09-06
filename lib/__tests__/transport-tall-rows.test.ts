import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { buildTransportCache, findTransportRate, getVehicleTypeByPax } from '@/lib/auto-pricing-service'

const TEST_SCOPE = { tenantId: 'test-tenant' }

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// One row per (route, vehicle) — migration 337. The page writes vocabulary
// KEYS ('sedan'); older rows and the engine's built-in names say 'Sedan'.
// They must be one vehicle to the cache.
describe('buildTransportCache — one row per vehicle', () => {
  beforeEach(() => setMockTables({}))

  it('matches a stored key against the engine\'s vehicle name, and the other way round', async () => {
    setMockTables({
      transportation_rates: [
        { id: 't1', is_active: true, service_type: 'day_tour', city: 'Cairo', duration: 'full_day', area: '',
          vehicle_type: 'sedan', base_rate_eur: 80, base_rate_non_eur: 90, capacity_min: 1, capacity_max: 2 },
        { id: 't2', is_active: true, service_type: 'day_tour', city: 'Cairo', duration: 'full_day', area: '',
          vehicle_type: 'Minivan', base_rate_eur: 120, base_rate_non_eur: 135, capacity_min: 3, capacity_max: 7 },
      ],
    })
    const cache = await buildTransportCache(TEST_SCOPE)
    const base = { serviceType: 'day_tour' as const, city: 'Cairo', duration: 'full_day' as const, area: null }
    expect(findTransportRate(cache, { ...base, vehicleType: 'Sedan' })?.rate.base_rate_eur).toBe(80)
    expect(findTransportRate(cache, { ...base, vehicleType: 'sedan' })?.rate.base_rate_eur).toBe(80)
    expect(findTransportRate(cache, { ...base, vehicleType: 'minivan' })?.rate.base_rate_eur).toBe(120)
    // A vehicle with no row is NOT invented.
    expect(findTransportRate(cache, { ...base, vehicleType: 'Van' })).toBeNull()
  })

  it('an agency\'s own vehicle ("coaster") is priced when it has a row', async () => {
    setMockTables({
      transportation_rates: [
        { id: 't3', is_active: true, service_type: 'day_tour', city: 'Luxor', duration: 'full_day', area: '',
          vehicle_type: 'coaster', base_rate_eur: 200, base_rate_non_eur: 200, capacity_min: 13, capacity_max: 24 },
      ],
    })
    const cache = await buildTransportCache(TEST_SCOPE)
    const bands = [{ key: 'car', min_pax: 1, max_pax: 3 }, { key: 'coaster', min_pax: 13, max_pax: 24 }]
    const vehicle = getVehicleTypeByPax(18, 'Luxor', bands)
    expect(vehicle).toBe('coaster')
    expect(findTransportRate(cache, { serviceType: 'day_tour', city: 'Luxor', duration: 'full_day', area: null, vehicleType: vehicle })?.rate.base_rate_eur).toBe(200)
  })
})
