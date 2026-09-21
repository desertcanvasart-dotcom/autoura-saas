// A transfer-only day in a generated itinerary is priced from the agency's
// AIRPORT TRANSFER rate. It was `vehiclePerDay * 0.5` — half the day rate of a
// fleet vehicle, a figure on nobody's rate sheet (found 2026-09-21).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { makeWriteMockSupabase } from './_write-mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getAirportTransferRate, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { createLandItineraryServices, transferOnlyDays } from '../ai/service-creation'

const SCOPE = { tenantId: 'test-tenant' }
const transfer = (over: Record<string, unknown>) => ({
  id: 'tr-1', service_code: 'AT', service_type: 'airport_transfer', vehicle_type: 'Sedan', city: 'Cairo',
  duration: null, area: null, base_rate_eur: 22, base_rate_non_eur: 22, is_active: true, ...over,
})

describe('the real airport transfer rate', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  it('is the agency’s row for that city and a vehicle that seats the group', async () => {
    setMockTables({ transportation_rates: [transfer({}), transfer({ id: 'tr-2', vehicle_type: 'Minivan', base_rate_eur: 35 })] })
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 2)).toMatchObject({ rate: 22, rateId: 'tr-1', vehicleType: 'Sedan' })
    expect(await getAirportTransferRate(SCOPE, 'cairo ', 5)).toMatchObject({ rate: 35, vehicleType: 'Minivan' })
  })

  it('a city with no airport transfer is a MISS — Luxor’s rate is not borrowed for it', async () => {
    setMockTables({ transportation_rates: [transfer({ city: 'Luxor' })] })
    expect(await getAirportTransferRate(SCOPE, 'Edfu', 2)).toBeNull()
  })

  it('no row for that vehicle, a blank rate, or no city: a miss', async () => {
    setMockTables({ transportation_rates: [transfer({ base_rate_eur: 0 })] })
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 2)).toBeNull()
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 30)).toBeNull()
    expect(await getAirportTransferRate(SCOPE, '', 2)).toBeNull()
  })

  it('a day tour’s rate is not an airport transfer', async () => {
    setMockTables({ transportation_rates: [transfer({ service_type: 'day_tour' })] })
    expect(await getAirportTransferRate(SCOPE, 'Cairo', 2)).toBeNull()
  })
})

const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100
const DAYS = [
  { day_number: 1, title: 'Arrival Cairo', city: 'Cairo', is_arrival: true, is_transfer_only: true, needs_airport_service: true, guide_required: false, includes_lunch: false, includes_dinner: false, includes_hotel: true },
  { day_number: 2, title: 'Luxor', city: 'Luxor', attractions: [], guide_required: true, includes_lunch: false, includes_dinner: false, includes_hotel: true },
  { day_number: 3, title: 'Departure', city: 'Luxor', is_departure: true, is_transfer_only: true },
]
const run = async (transferRateByDay: Record<number, number>) => {
  const sb = makeWriteMockSupabase()
  const totals = await createLandItineraryServices(sb as never, {
    tenantId: 'test-tenant', days: DAYS, itineraryId: 'itin-1', startDateObj: new Date('2026-11-01T00:00:00Z'), durationDays: 3,
    effectiveCity: 'Cairo', totalPax: 2, isEuroPassport: true, skipPricing: false, withMargin, tier: 'standard',
    finalLanguage: 'English', includeLunch: false, includeDinner: false, includeAccommodationFinal: false,
    vehiclePerDay: 80, guidePerDay: 60, selectedVehicle: { id: 'v', vehicle_type: 'Minivan' }, selectedGuide: { id: 'g' }, selectedHotel: null,
    hotelRate: 0, hotelName_final: '', roomsNeeded: 1, airportServiceRates: { arrival: 30, departure: 30 },
    hotelServiceRate: 15, lunchRate: 0, dinnerRate: 0, allEntranceFees: [], tippingRows: [], transferRateByDay,
  } as never)
  type Row = Record<string, unknown>
  const dayOf = new Map((sb.store.itinerary_days as Row[]).map(d => [d.id, d.day_number]))
  const transport = ((sb.store.itinerary_services ?? []) as Row[]).filter(s => s.service_type === 'transportation')
    .map(s => ({ day: dayOf.get(s.itinerary_day_id), name: s.service_name, cost: s.total_cost }))
  return { totals, transport }
}

describe('the generated itinerary', () => {
  it('prices each transfer-only day at the rate it was given — arrival in Cairo 22, departure from Luxor 18 — not half of 80', async () => {
    const { transport } = await run({ 1: 22, 3: 18 })
    expect(transport).toEqual([
      { day: 1, name: 'Airport/Hotel Transfer', cost: 22 },
      { day: 2, name: 'Minivan Transportation', cost: 80 },
      { day: 3, name: 'Airport Transfer', cost: 18 },
    ])
  })

  it('writes NO transfer line when no rate was given — never a made-up one', async () => {
    const { transport } = await run({})
    expect(transport).toEqual([{ day: 2, name: 'Minivan Transportation', cost: 80 }])
  })

  it('which days those are: transfer-only, not free or sailing, with the day’s own city', () => {
    expect(transferOnlyDays([...DAYS, { day_number: 4, is_transfer_only: true, is_sailing_day: true }], 'Cairo'))
      .toEqual([{ day: 1, city: 'Cairo' }, { day: 3, city: 'Luxor' }])
    expect(transferOnlyDays([{ day_number: 1, is_transfer_only: true }], 'Aswan')).toEqual([{ day: 1, city: 'Aswan' }])
    expect(transferOnlyDays(null, 'Cairo')).toEqual([])
  })
})

describe('it cannot come back', () => {
  it('no vehicle rate is multiplied by a fraction anywhere in the generator', () => {
    for (const f of ['lib/ai/service-creation.ts', 'app/api/ai/generate-itinerary/route.ts']) {
      const code = readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/vehiclePerDay\s*\*\s*0?\.\d/)
    }
  })
  it('the route looks the rate up AFTER the days exist, and a miss withholds the price', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ai/generate-itinerary/route.ts'), 'utf8')
    expect(route.indexOf('applyDayRules(itineraryData.days')).toBeLessThan(route.indexOf('getAirportTransferRate({ tenantId: tenant_id }'))
    expect(route.indexOf('getAirportTransferRate({ tenantId: tenant_id }')).toBeLessThan(route.lastIndexOf('await createItineraryRecord(supabase'))
    expect(route).toMatch(/pricingBlocked = holes\.length > 0\s+effectiveSkipPricing = skip_pricing \|\| pricingBlocked/)
  })
})
