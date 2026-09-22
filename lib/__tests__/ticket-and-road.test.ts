// A day is a ticket AND road (sibling #447): the two double charges, the road
// toggle beside a ticket, and boarding / leaving the ship.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, parseItinerary, determineTransportNeeds, extraTransfersFor, cruiseAssistanceFor, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { applyDayForm, type DayForm } from '@/lib/tours/day-edit'
import { parseDaysCsv, serializeDaysCsv } from '@/lib/tours/itinerary-csv'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }
const papa = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }) as never

describe('the double charges', () => {
  const days = parseItinerary([
    { day: 1, city: 'Cairo', meals: N, attractions: ['Giza Plateau'], accommodation_type: 'hotel' },
    { day: 2, city: 'Luxor', meals: N, attractions: ['Karnak Temple'], transport_type: 'flight', accommodation_type: 'hotel' },
    { day: 3, city: 'Luxor', meals: N, transport_type: 'sleeping_train', accommodation_type: 'none' },
    { day: 4, city: 'Cairo', meals: N, attractions: ['Egyptian Museum'], accommodation_type: 'hotel' },
    { day: 5, city: 'Cairo', meals: N },
  ])
  it('a flight day with sightseeing is a DAY TOUR in the city it landed in — not a road drop-off on top of the ticket', () => {
    expect(determineTransportNeeds(days[1], days[0], days[2]).serviceType).toBe('day_tour')
  })
  it('the morning after a sleeper, with sightseeing, is a day tour — the sleeper made the journey', () => {
    expect(determineTransportNeeds(days[3], days[2], days[4]).serviceType).toBe('day_tour')
  })
  it('an unmarked city change is still a road drop-off', () => {
    const [a, b] = parseItinerary([{ day: 1, city: 'Cairo', meals: N }, { day: 2, city: 'Alexandria', meals: N, attractions: ['Catacombs'] }, { day: 3, city: 'Alexandria', meals: N }])
    expect(determineTransportNeeds(b, a, null).serviceType).toBe('intercity_dropoff')
  })
})

describe('road beside a ticket', () => {
  const trip = (over: Record<string, unknown>) => parseItinerary([
    { day: 1, city: 'Cairo', meals: N, accommodation_type: 'hotel' },
    { day: 2, city: 'Luxor', meals: N, accommodation_type: 'hotel', ...over },
    { day: 3, city: 'Aswan', meals: N, accommodation_type: 'hotel' },
  ])
  const legs = (over: Record<string, unknown>) => { const d = trip(over); return extraTransfersFor(d[1], d[0], d[2]).map(e => `${e.slug}@${e.city}`) }

  it('absent: a ticket day prices its ticket and nothing more, as always', () => {
    expect(legs({ transport_type: 'flight' })).toEqual([])
    expect(legs({ transport_type: 'train' })).toEqual([])
  })
  it('flight, road on: to the airport it leaves from, and from the one it lands at', () => {
    expect(legs({ transport_type: 'flight', road_transfers: true })).toEqual(['road-to-airport@Cairo', 'road-from-airport@Luxor'])
  })
  it('…but not from the arrival airport when the day already has a vehicle there (its sightseeing, or its arrival service)', () => {
    expect(legs({ transport_type: 'flight', road_transfers: true, attractions: ['Karnak Temple'] })).toEqual(['road-to-airport@Cairo'])
    expect(legs({ transport_type: 'flight', road_transfers: true, services: { airport_arrival: true } })).toEqual(['road-to-airport@Cairo'])
  })
  it('the leg’s own route decides where the airports are', () => {
    expect(legs({ transport_type: 'flight', road_transfers: true, leg_from: 'Hurghada' })).toEqual(['road-to-airport@Hurghada', 'road-from-airport@Luxor'])
  })
  it('day train, road on: to the station and from the station', () => {
    expect(legs({ transport_type: 'train', road_transfers: true })).toEqual(['road-to-station@Cairo', 'road-from-station@Luxor'])
  })
  it('sleeper, road on: to the station tonight here, from the station on arrival THERE', () => {
    expect(legs({ transport_type: 'sleeping_train', road_transfers: true })).toEqual(['road-to-station@Luxor', 'road-from-station@Aswan'])
  })
  it('road on a ROAD day changes nothing; road off = no vehicle', () => {
    expect(legs({ road_transfers: true })).toEqual([])
    expect(trip({ road_transfers: true })[1].road_transfers).toBe(true)
    expect(trip({ road_transfers: 'yes' })[1].road_transfers).toBeUndefined()
  })
})

describe('boarding and leaving the ship', () => {
  const days = parseItinerary([
    { day: 1, city: 'Luxor', meals: N, accommodation_type: 'hotel' },
    { day: 2, city: 'Luxor', meals: N, accommodation_type: 'cruise' },
    { day: 3, city: 'Edfu', meals: N, accommodation_type: 'cruise' },
    { day: 4, city: 'Aswan', meals: N, accommodation_type: 'hotel' },
    { day: 5, city: 'Aswan', meals: N, accommodation_type: 'hotel', services: { cruise_embark: true, guide_required: false } },
    { day: 6, city: 'Aswan', meals: N, accommodation_type: 'cruise', services: { cruise_embark: false, guide_required: false } },
  ])
  it('derived: the first night aboard boards, the first day ashore leaves, nothing in between', () => {
    expect(cruiseAssistanceFor(days[1], days[0])).toEqual({ embark: true, disembark: false })
    expect(cruiseAssistanceFor(days[2], days[1])).toEqual({ embark: false, disembark: false })
    expect(cruiseAssistanceFor(days[3], days[2])).toEqual({ embark: false, disembark: true })
  })
  it('a stated tick wins — on where nothing would be derived, off where it would', () => {
    expect(cruiseAssistanceFor(days[4], days[3]).embark).toBe(true)
    expect(cruiseAssistanceFor(days[5], days[4]).embark).toBe(false)
  })
})

describe('priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const price = async (days: unknown[], extra: Record<string, unknown[]> = {}) => {
    const t = fullRateTables()
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: days, duration_days: days.length, tour_type: 'multi_day' }]
    Object.assign(t, extra)
    setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const lines = (r: Awaited<ReturnType<typeof price>>, type: string) => r.services.filter(s => s.serviceType === type).map(s => `d${s.dayNumber} ${s.serviceName} = ${s.unitCost}`)

  it('a flight day, road on: the ticket AND a real airport transfer at each end, from the sheet', async () => {
    const r = await price([
      { day: 1, title: 'Cairo', city: 'Cairo', meals: N, accommodation_type: 'hotel', services: { airport_arrival: true, guide_required: false } },
      { day: 2, title: 'Fly to Luxor', city: 'Luxor', meals: N, accommodation_type: 'hotel', transport_type: 'flight', road_transfers: true, services: { guide_required: false } },
      { day: 3, title: 'Home', city: 'Luxor', meals: N, services: { airport_departure: true, guide_required: false } },
    ], {
      flight_rates: [{ id: 'f1', airline: 'MS', flight_number: '61', cabin_class: 'economy', route_from: 'Cairo', route_to: 'Luxor', base_rate_eur: 90, tax_eur: 10, base_rate_non_eur: 90, tax_non_eur: 10, is_active: true }],
      transportation_rates: [
        { id: 't1', service_code: 'A', service_type: 'airport_transfer', vehicle_type: 'Sedan', city: 'Cairo', base_rate_eur: 22, base_rate_non_eur: 22, is_active: true },
        { id: 't2', service_code: 'B', service_type: 'airport_transfer', vehicle_type: 'Sedan', city: 'Luxor', base_rate_eur: 18, base_rate_non_eur: 18, is_active: true },
      ],
    })
    expect(lines(r, 'transportation').filter(l => /^d2 /.test(l)).sort()).toEqual(['d2 Transfer from the airport - Luxor = 18', 'd2 Transfer to the airport - Cairo = 22'])
    expect(r.holes.filter(h => h.dayNumber === 2 && h.kind === 'transport' && /road/.test(h.lookupAttempted))).toEqual([])
  })

  it('the first night aboard and the first day ashore are priced from the hotel assistance rates', async () => {
    const r = await price([
      { day: 1, title: 'Board', city: 'Luxor', meals: N, accommodation_type: 'cruise', services: { guide_required: false } },
      { day: 2, title: 'Sail', city: 'Edfu', meals: N, accommodation_type: 'cruise', services: { guide_required: false } },
      { day: 3, title: 'Leave', city: 'Aswan', meals: N, accommodation_type: 'hotel', services: { guide_required: false } },
      { day: 4, title: 'Home', city: 'Aswan', meals: N, services: { guide_required: false } },
    ], { hotel_staff_rates: [
      { id: 'hs1', service_type: 'checkin_assist', hotel_category: 'standard', rate_eur: 15, is_active: true },
      { id: 'hs2', service_type: 'checkout_assist', hotel_category: 'standard', rate_eur: 15, is_active: true },
    ] })
    expect(lines(r, 'hotel_service').filter(l => /Cruise/.test(l))).toEqual(['d1 Cruise Boarding Assistance = 15', 'd3 Cruise Leaving Assistance = 15'])
  })
})

describe('saved, and round-tripped', () => {
  const FORM: DayForm = { title: 'Day', description: '', meals: {}, picked: [], transportType: 'flight', transportRateId: '', city: 'Luxor', night: 'cruise', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false }
  it('the editor stores road and boarding only when stated', () => {
    const on = applyDayForm({ day: 1, services: { guide_required: true } }, { ...FORM, roadTransfers: true, cruiseAssist: { embark: false } }, 1)
    expect(on).toMatchObject({ road_transfers: true, services: { guide_required: true, cruise_embark: false } })
    const unsaid = applyDayForm({ day: 1, road_transfers: true, services: { cruise_embark: false, guide_required: true } }, { ...FORM, cruiseAssist: {} }, 1)
    expect(unsaid.road_transfers).toBeUndefined()
    expect(unsaid.services).toEqual({ guide_required: true })
  })
  it('the days sheet carries all three, and blank stays not stated', () => {
    const tour = [{ template_code: 'T', itinerary: [
      { day: 1, title: 'A', city: 'Luxor', meals: N, transport_type: 'flight', road_transfers: true, accommodation_type: 'cruise', services: { cruise_embark: false, guide_required: false } },
      { day: 2, title: 'B', city: 'Edfu', meals: N, accommodation_type: 'cruise', services: { guide_required: false } },
    ] }]
    const parsed = parseDaysCsv(serializeDaysCsv(tour), papa)
    expect(parsed.refused).toEqual([])
    const [a, b] = parsed.byTemplate.get('T')! as Array<Record<string, unknown>>
    expect(a).toMatchObject({ road_transfers: true, services: { cruise_embark: false } })
    expect(b.road_transfers).toBeUndefined()
    expect((b.services as Record<string, unknown>).cruise_embark).toBeUndefined()
  })
  it('the editor offers the road choice and the boarding ticks, and says what they price', () => {
    const page = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
    expect(page).toContain('Road transfers:')
    expect(page).toContain('Boarding assistance at the quay')
    expect(page).toContain('Assistance leaving the ship')
    expect(page).toContain('The ticket, plus the transfer to the station tonight and from the station on arrival tomorrow.')
  })
})
