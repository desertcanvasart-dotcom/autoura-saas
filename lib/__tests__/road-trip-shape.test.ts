// The shape of a road move between cities, read from the days (sibling #462):
// an overnight return — out on day N, back on day N+1 — is charged ONCE at
// the agency's Intercity Overnight rate, and the day back is listed as
// included. It used to be two Intercity Drop-offs, and the 72 overnight rows
// on production never priced.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, parseItinerary, determineTransportNeeds, previewDayTransport, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { roadShapeAt } from '@/lib/pricing/road-trips'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }
const shapes = (days: Array<Record<string, unknown>>) => days.map((_, i) => roadShapeAt(days, i)?.kind ?? null)

describe('the shape', () => {
  it('out and back the next day by road: an overnight return, then the day back included', () => {
    expect(shapes([{ city: 'Aswan' }, { city: 'Abu Simbel' }, { city: 'Aswan' }, { city: 'Aswan' }])).toEqual([null, 'overnight_return', 'return_included', null])
  })
  it('out and drive back to fly out (the flight’s own From): an overnight return too', () => {
    expect(shapes([{ city: 'Aswan' }, { city: 'Abu Simbel' }, { city: 'Cairo', transport_type: 'flight', leg_from: 'Aswan' }])).toEqual([null, 'overnight_return', null])
  })
  it('on to a third city, or staying: one way', () => {
    expect(shapes([{ city: 'Cairo' }, { city: 'Luxor' }, { city: 'Aswan' }])).toEqual([null, 'one_way', 'one_way'])
    expect(shapes([{ city: 'Cairo' }, { city: 'Luxor' }, { city: 'Luxor' }])).toEqual([null, 'one_way', null])
  })
  it('not a road move at all: a ticket, a ship, a day in the air, or a sleeper the night before', () => {
    expect(shapes([{ city: 'Cairo' }, { city: 'Luxor', transport_type: 'flight' }, { city: 'Cairo' }])).toEqual([null, null, 'one_way'])
    expect(shapes([{ city: 'Luxor', accommodation_type: 'cruise' }, { city: 'Aswan', accommodation_type: 'cruise' }, { city: 'Aswan' }])).toEqual([null, null, null])
    expect(shapes([{ city: 'Cairo' }, { in_transit: true }, { city: 'Luxor' }])).toEqual([null, null, null])
    expect(shapes([{ city: 'Cairo', transport_type: 'sleeping_train' }, { city: 'Luxor' }, { city: 'Cairo' }])).toEqual([null, null, 'one_way'])
  })
  it('a same-day return is not derived — a day has one city, where it is based', () => {
    expect(shapes([{ city: 'Aswan' }, { city: 'Aswan' }])).toEqual([null, null])
  })
})

describe('the engine', () => {
  it('asks for the agency’s Intercity Overnight on the day out, nothing on the day back', () => {
    const days = parseItinerary([
      { day: 1, city: 'Aswan', meals: N, accommodation_type: 'hotel', services: { guide_required: false } },
      { day: 2, city: 'Abu Simbel', meals: N, accommodation_type: 'hotel', services: { guide_required: false } },
      { day: 3, city: 'Aswan', meals: N, accommodation_type: 'hotel', services: { guide_required: false } },
    ])
    expect(determineTransportNeeds(days[1], days[0], days[2], roadShapeAt(days, 1)).serviceType).toBe('intercity_overnight')
    expect(determineTransportNeeds(days[2], days[1], null, roadShapeAt(days, 2)).serviceType).not.toBe('intercity_dropoff')
    expect(determineTransportNeeds(days[1], days[0], days[2], null).serviceType).toBe('intercity_dropoff') // without the shape: as before
  })

  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const S = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }
  const TRIP = [
    { day: 1, title: 'Aswan', city: 'Aswan', meals: N, accommodation_type: 'hotel', services: S },
    { day: 2, title: 'To Abu Simbel', city: 'Abu Simbel', meals: N, accommodation_type: 'hotel', services: S },
    { day: 3, title: 'Back to Aswan', city: 'Aswan', meals: N, accommodation_type: 'hotel', services: S },
    { day: 4, title: 'Aswan', city: 'Aswan', meals: N, services: S },
  ]
  const route = (service_type: string, city: string, destination_city: string, rate: number) =>
    ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus'].map(vehicle_type => ({ id: `${service_type}-${city}-${destination_city}-${vehicle_type}`, service_code: 'R', service_type, vehicle_type, city, destination_city, origin_city: null, base_rate_eur: rate, base_rate_non_eur: rate, is_active: true }))
  const price = async (rates: unknown[]) => {
    const t = fullRateTables(); t.tour_templates = [{ ...cairoTemplateRow, itinerary: TRIP, duration_days: 4, tour_type: 'multi_day' }]; t.transportation_rates = rates; setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const transport = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'transportation').map(s => `d${s.dayNumber} ${s.serviceName} = ${s.unitCost}`)

  it('charged ONCE at the overnight rate; the day back reads included at 0; the drop-off rate is not used', async () => {
    const r = await price([...route('intercity_dropoff', 'Aswan', 'Abu Simbel', 100), ...route('intercity_dropoff', 'Abu Simbel', 'Aswan', 100), ...route('intercity_overnight', 'Aswan', 'Abu Simbel', 160)])
    expect(transport(r)).toEqual([
      'd2 Sedan - Abu Simbel = 160',
      'd3 Road transfer back Abu Simbel → Aswan — included in the overnight return priced on day 2 = 0',
    ])
    expect(r.holes.filter(h => h.kind === 'transport')).toEqual([])
    // 160 for the group, shared by two — nothing else on this bare programme is priced.
    expect(r.paxPricing.find(p => p.numPax === 2)!.withoutLeader.pricePerPerson).toBe(80)
  })
  it('no overnight rate for the route: a gap naming the route and the shape — the two drop-offs are NOT charged instead', async () => {
    const r = await price([...route('intercity_dropoff', 'Aswan', 'Abu Simbel', 100), ...route('intercity_dropoff', 'Abu Simbel', 'Aswan', 100)])
    expect(transport(r).filter(l => !/no rate|included/i.test(l))).toEqual([])
    expect(r.holes.some(h => h.kind === 'transport' && /No intercity overnight rate for Sedan Aswan → Abu Simbel/.test(h.message))).toBe(true)
  })
  it('the preview lists the overnight return on the day out and the included drive back', async () => {
    setMockTables({ transportation_rates: route('intercity_overnight', 'Aswan', 'Abu Simbel', 160) })
    const p = await previewDayTransport({ tenantId: 'test-tenant' }, TRIP, { pax: 2 })
    expect(p[1].lines.map(l => `${l.serviceType} ${l.cost}`)).toEqual(['intercity_overnight 160'])
    expect(p[2].lines.map(l => `${l.serviceType} ${l.cost}`)).toEqual(['intercity_return 0'])
  })
})
