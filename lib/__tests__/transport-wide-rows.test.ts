import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { buildTransportCache, findTransportRate } from '@/lib/auto-pricing-service'

const TEST_SCOPE = { tenantId: 'test-tenant' }

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// The bulk importer writes WIDE transportation_rates rows (one row, per-class
// rate columns) but the engine matches per vehicle_type with a single
// base_rate_eur. buildTransportCache expands wide rows so imported transport
// is actually found and priced, instead of registering as €0 / a hole.
describe('buildTransportCache — wide bulk-imported transportation rows', () => {
  beforeEach(() => setMockTables({}))

  it('expands a wide row into a priced rate per vehicle class', async () => {
    setMockTables({
      transportation_rates: [{
        id: 't1', is_active: true, service_type: 'day_tour', city: 'Cairo',
        duration: 'full_day', area: '', vehicle_type: null,
        sedan_rate_eur: 80, sedan_rate_non_eur: 90,
        minivan_rate_eur: 120, minivan_rate_non_eur: 135,
        // no van/minibus/bus rates
      }],
    })
    const cache = await buildTransportCache(TEST_SCOPE)

    const base = { serviceType: 'day_tour' as const, city: 'Cairo', duration: 'full_day' as const, area: null }

    const sedan = findTransportRate(cache, { ...base, vehicleType: 'Sedan' })
    expect(sedan?.rate.base_rate_eur).toBe(80)
    expect(sedan?.rate.base_rate_non_eur).toBe(90)
    expect(sedan?.rate.capacity_max).toBe(2) // default from VEHICLE_CAPACITY

    const minivan = findTransportRate(cache, { ...base, vehicleType: 'Minivan' })
    expect(minivan?.rate.base_rate_eur).toBe(120)

    // A class with no rate column is NOT invented — it's simply absent.
    const van = findTransportRate(cache, { ...base, vehicleType: 'Van' })
    expect(van).toBeNull()
  })

  it('leaves normal (tall) rows untouched', async () => {
    setMockTables({
      transportation_rates: [{
        id: 't2', is_active: true, service_type: 'day_tour', city: 'Luxor',
        duration: 'full_day', area: '', vehicle_type: 'Sedan',
        base_rate_eur: 60, base_rate_non_eur: 70, capacity_min: 1, capacity_max: 2,
      }],
    })
    const cache = await buildTransportCache(TEST_SCOPE)
    const sedan = findTransportRate(cache, {
      serviceType: 'day_tour', city: 'Luxor', duration: 'full_day', area: null, vehicleType: 'Sedan',
    })
    expect(sedan?.rate.base_rate_eur).toBe(60)
  })
})
