// The AI itinerary generator prices transport from the agency's Rates →
// Transportation, by the tour engine's own rule.
//
// It priced every non-free day at the day rate of a FLEET vehicle
// (`vehicles.daily_rate`) — and a transfer-only day at HALF of it, a figure on
// nobody's rate sheet. No agency has a fleet vehicle on file (production,
// 2026-09-22: 0 rows for all 8), so the generator withheld its price from
// everyone, while each agency has 500+ real transport rates.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { makeWriteMockSupabase } from './_write-mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getTransportRateFor, getAirportTransferRate, clearVocabularyMemo } from '@/lib/auto-pricing-service'

const SCOPE = { tenantId: 'test-tenant' }
const rate = (over: Record<string, unknown>) => ({
  id: 'tr-1', service_code: 'T', service_type: 'airport_transfer', vehicle_type: 'Sedan', city: 'Cairo',
  origin_city: null, destination_city: null, duration: null, area: null, base_rate_eur: 22, base_rate_non_eur: 22, is_active: true, ...over,
})

// ── the RATE for a need ──────────────────────────────────────────────────────
describe('the agency’s real rate for a need', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  it('airport transfer: the city’s row, in a vehicle that seats the group', async () => {
    setMockTables({ transportation_rates: [rate({}), rate({ id: 'tr-2', vehicle_type: 'Minivan', base_rate_eur: 35 })] })
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 2)).toMatchObject({ rate: 22, rateId: 'tr-1', vehicleType: 'Sedan' })
    expect(await getAirportTransferRate(SCOPE, 'cairo ', 5)).toMatchObject({ rate: 35, vehicleType: 'Minivan' })
  })

  it('day tour: the day-tour row for the city — not the airport transfer’s', async () => {
    setMockTables({ transportation_rates: [rate({}), rate({ id: 'dt', service_type: 'day_tour', base_rate_eur: 60 })] })
    expect(await getTransportRateFor(SCOPE, { serviceType: 'day_tour', city: 'Cairo' }, 2)).toMatchObject({ rate: 60, rateId: 'dt' })
  })

  it('a road move is its ROUTE: Luxor → Aswan does not price Aswan → Luxor', async () => {
    setMockTables({ transportation_rates: [rate({ id: 'la', service_type: 'intercity_dropoff', city: 'Luxor', origin_city: 'Luxor', destination_city: 'Aswan', base_rate_eur: 90 })] })
    expect(await getTransportRateFor(SCOPE, { serviceType: 'intercity_dropoff', city: 'Aswan', originCity: 'Luxor', duration: 'one_way' }, 2)).toMatchObject({ rate: 90, rateId: 'la' })
    expect(await getTransportRateFor(SCOPE, { serviceType: 'intercity_dropoff', city: 'Luxor', originCity: 'Aswan', duration: 'one_way' }, 2)).toBeNull()
  })

  it('a miss is a miss: another city’s rate is never borrowed; blank rate, no vehicle, no city', async () => {
    setMockTables({ transportation_rates: [rate({ city: 'Luxor' }), rate({ id: 'z', base_rate_eur: 0 })] })
    expect(await getAirportTransferRate(SCOPE, 'Edfu', 2)).toBeNull()
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 2)).toBeNull()
    expect(await getAirportTransferRate(SCOPE, 'Luxor', 40)).toBeNull()
    expect(await getAirportTransferRate(SCOPE, '', 2)).toBeNull()
  })
})
