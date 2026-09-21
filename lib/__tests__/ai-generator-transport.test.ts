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
import { transportNeedsForGeneratedDays } from '../ai/day-transport'
import { createLandItineraryServices } from '../ai/service-creation'

const SCOPE = { tenantId: 'test-tenant' }
const rate = (over: Record<string, unknown>) => ({
  id: 'tr-1', service_code: 'T', service_type: 'airport_transfer', vehicle_type: 'Sedan', city: 'Cairo',
  origin_city: null, destination_city: null, duration: null, area: null, base_rate_eur: 22, base_rate_non_eur: 22, is_active: true, ...over,
})

// ── WHAT each generated day needs ────────────────────────────────────────────
describe('what a generated day needs — the engine’s rule', () => {
  const needs = (days: Record<string, unknown>[]) =>
    transportNeedsForGeneratedDays(days, 'Cairo').map(n => `${n.day}: ${n.serviceType} ${n.originCity ? n.originCity + '→' : ''}${n.city}`)

  it('arrival → airport transfer; touring → day tour; a road move → the ROUTE; departure → airport transfer', () => {
    expect(needs([
      { day_number: 1, city: 'Cairo', is_arrival: true, is_transfer_only: true, guide_required: false },
      { day_number: 2, city: 'Cairo', guide_required: true, attractions: ['Giza Plateau'] },
      { day_number: 3, city: 'Alexandria', guide_required: true, attractions: ['Catacombs'] },
      { day_number: 4, city: 'Alexandria', is_departure: true, is_transfer_only: true },
    ])).toEqual(['1: airport_transfer Cairo', '2: day_tour Cairo', '3: intercity_dropoff Cairo→Alexandria', '4: airport_transfer Alexandria'])
  })

  it('a day that FLIES to the next city has no road transfer — it tours where it lands', () => {
    expect(needs([
      { day_number: 1, city: 'Cairo', guide_required: true, attractions: ['Giza Plateau'] },
      { day_number: 2, city: 'Luxor', flight_info: 'MS 123', guide_required: true, attractions: ['Karnak Temple'] },
    ])).toEqual(['1: day_tour Cairo', '2: day_tour Luxor'])
  })

  it('free days, sailing days, and a day with nothing to drive to: no transport', () => {
    expect(needs([
      { day_number: 1, city: 'Hurghada', is_free_day: true },
      { day_number: 2, city: 'Edfu', is_sailing_day: true, is_cruise_day: true },
      { day_number: 3, city: 'Hurghada', guide_required: false, attractions: [] },
    ])).toEqual([])
  })

  it('aboard a cruise the city changes by SHIP — no road transfer; a guided stop is a day tour', () => {
    expect(needs([
      { day_number: 1, city: 'Luxor', is_cruise_day: true, guide_required: true, attractions: ['Karnak Temple'] },
      { day_number: 2, city: 'Aswan', is_cruise_day: true, guide_required: true, attractions: ['Philae Temple'] },
    ])).toEqual(['1: day_tour Luxor', '2: day_tour Aswan'])
  })

  it('a day with no city takes the itinerary’s; with neither, it asks for nothing', () => {
    expect(needs([{ day_number: 1, guide_required: true, attractions: ['Giza Plateau'] }])).toEqual(['1: day_tour Cairo'])
    expect(transportNeedsForGeneratedDays([{ day_number: 1, guide_required: true }], '')).toEqual([])
  })

  it('the lines say what they are', () => {
    const [a, b] = transportNeedsForGeneratedDays([
      { day_number: 1, city: 'Luxor', guide_required: true, attractions: ['Karnak Temple'] },
      { day_number: 2, city: 'Aswan', guide_required: true, attractions: ['Philae Temple'] },
    ], 'Luxor')
    expect(a.label).toBe('Day Tour Transportation')
    expect(b.label).toBe('Road Transfer Luxor → Aswan')
  })
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

// ── the itinerary that gets written ──────────────────────────────────────────
const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100
const DAYS = [
  { day_number: 1, title: 'Arrival Cairo', city: 'Cairo', is_arrival: true, is_transfer_only: true, needs_airport_service: true, guide_required: false, includes_lunch: false, includes_dinner: false },
  { day_number: 2, title: 'Luxor', city: 'Luxor', attractions: [], guide_required: true, includes_lunch: false, includes_dinner: false },
  { day_number: 3, title: 'At leisure', city: 'Luxor', is_free_day: true, includes_lunch: false, includes_dinner: false },
  { day_number: 4, title: 'Departure', city: 'Luxor', is_departure: true, is_transfer_only: true },
]
type Row = Record<string, unknown>
const run = async (transportByDay: Record<number, { rate: number; label: string; vehicleType: string; rateId: string }>) => {
  const sb = makeWriteMockSupabase()
  const totals = await createLandItineraryServices(sb as never, {
    tenantId: 'test-tenant', days: DAYS, itineraryId: 'itin-1', startDateObj: new Date('2026-11-01T00:00:00Z'), durationDays: 4,
    effectiveCity: 'Cairo', totalPax: 2, isEuroPassport: true, skipPricing: false, withMargin, tier: 'standard',
    finalLanguage: 'English', includeLunch: false, includeDinner: false, includeAccommodationFinal: false,
    guidePerDay: 60, selectedGuide: { id: 'g' }, hotelByDay: {},
    airportServiceRates: { arrival: 30, departure: 30 },
    hotelServiceRate: 15, lunchRate: 0, dinnerRate: 0, allEntranceFees: [], tippingRows: [], transportByDay,
  } as never)
  const dayOf = new Map((sb.store.itinerary_days as Row[]).map(d => [d.id, d.day_number]))
  const transport = ((sb.store.itinerary_services ?? []) as Row[]).filter(s => s.service_type === 'transportation')
    .map(s => ({ day: dayOf.get(s.itinerary_day_id), name: s.service_name, cost: s.total_cost, code: s.service_code }))
  return { totals, transport }
}
const T = (rateValue: number, label: string, rateId: string) => ({ rate: rateValue, label, vehicleType: 'Sedan', rateId })

describe('the generated itinerary', () => {
  it('each day is charged ITS transport, at ITS rate, and carries the rate’s id', async () => {
    const { transport } = await run({ 1: T(22, 'Airport Transfer', 'r1'), 2: T(95, 'Road Transfer Cairo → Luxor', 'r2'), 4: T(18, 'Airport Transfer', 'r4') })
    expect(transport).toEqual([
      { day: 1, name: 'Airport/Hotel Transfer', cost: 22, code: 'r1' },
      { day: 2, name: 'Road Transfer Cairo → Luxor', cost: 95, code: 'r2' },
      { day: 4, name: 'Airport Transfer', cost: 18, code: 'TRANSFER' },
    ])
  })

  it('a free day has no transport even if a rate is handed in', async () => {
    const { transport } = await run({ 3: T(60, 'Day Tour Transportation', 'r3') })
    expect(transport).toEqual([])
  })

  it('a day with no rate gets NO line — never a made-up one', async () => {
    expect((await run({})).transport).toEqual([])
  })
})

describe('it cannot come back', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/ai/generate-itinerary/route.ts'), 'utf8')
  const creator = readFileSync(join(process.cwd(), 'lib/ai/service-creation.ts'), 'utf8')
  const code = (src: string) => src.replace(/\/\/.*$/gm, '')
  it('the generator does not read the fleet table, and multiplies no vehicle rate by a fraction', () => {
    expect(code(route)).not.toMatch(/from\('vehicles'\)/)
    for (const src of [route, creator]) {
      expect(code(src)).not.toMatch(/vehiclePerDay|selectedVehicle/)
      expect(code(src)).not.toMatch(/\*\s*0?\.5\b/)
    }
  })
  it('transport is looked up AFTER the days exist and BEFORE the record is created, and a miss withholds the price', () => {
    expect(route.indexOf('applyDayRules(itineraryData.days')).toBeLessThan(route.indexOf('transportNeedsForGeneratedDays(itineraryData?.days'))
    expect(route.indexOf('transportNeedsForGeneratedDays(itineraryData?.days')).toBeLessThan(route.lastIndexOf('await createItineraryRecord(supabase'))
    expect(route).toMatch(/pricingBlocked = holes\.length > 0\s+effectiveSkipPricing = skip_pricing \|\| pricingBlocked/)
  })
  it('what a day needs is decided by the engine’s own function, not a second copy', () => {
    expect(readFileSync(join(process.cwd(), 'lib/ai/day-transport.ts'), 'utf8')).toContain('determineTransportNeeds(day, prev, next)')
  })
})
