// A night IN THE AIR (sibling #456). The overnight flight out is a day of the
// programme — the traveller's Day 1 — and nothing on it is sold. It used to be
// priced like any first day: a Cairo hotel, an airport transfer, a meet &
// greet and a check-in, for a night spent over the Mediterranean; and the day
// they actually LANDED got none of its arrival services.
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
import { calculateDayBasedPricing, parseItinerary, tipOccasionsFor, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { isInTransit, arrivalDayIndex, departureDayIndex, groundedNeighbour } from '@/lib/pricing/flight-leg'
import { collectTicketLegs } from '@/lib/pricing/ticket-legs'
import { applyDayForm, type DayForm } from '@/lib/tours/day-edit'
import { parseDaysCsv, serializeDaysCsv } from '@/lib/tours/itinerary-csv'

const papa = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }) as never
const NONE = { breakfast: 'none', lunch: 'none', dinner: 'none' }

describe('which day is which', () => {
  const days = [{ in_transit: true }, { city: 'Cairo' }, { city: 'Luxor' }, { in_transit: true }]
  it('the arrival day is the first day ON THE GROUND; the departure day the last', () => {
    expect(arrivalDayIndex(days)).toBe(1)
    expect(departureDayIndex(days)).toBe(2)
    expect(arrivalDayIndex([{ city: 'Cairo' }])).toBe(0)
    expect(arrivalDayIndex([{ in_transit: true }])).toBe(-1)
  })
  it('a day in the air is not a neighbour: it is nowhere the party came from or goes to', () => {
    expect(groundedNeighbour(days, 1, -1)).toBeNull()
    expect(groundedNeighbour(days, 2, 1)).toBeNull()
    expect(groundedNeighbour([{ city: 'Cairo' }, { in_transit: true }, { city: 'Luxor' }], 2, -1)).toEqual({ city: 'Cairo' })
  })
  it('only the flag counts — `true`, nothing looser', () => {
    expect(isInTransit({ in_transit: true })).toBe(true)
    for (const d of [{ in_transit: 'true' }, { in_transit: 1 }, {}, null, 'x']) expect(isInTransit(d)).toBe(false)
  })
})

describe('the engine sells NOTHING on a day in the air — whatever else the day still says', () => {
  const programme = [
    { day: 1, title: 'Fly to Cairo — Pyramids tomorrow', city: 'Cairo', in_transit: true, accommodation_type: 'hotel',
      meals: { breakfast: 'included', lunch: 'external', dinner: 'external' }, attractions: ['Giza Plateau'], transport_type: 'flight',
      services: { airport_arrival: true, airport_departure: false, hotel_checkin: true, hotel_checkout: false, guide_required: true } },
    { day: 2, title: 'Cairo', city: 'Cairo', meals: NONE, attractions: ['Giza Plateau'] },
    { day: 3, title: 'Home', city: 'Cairo', meals: NONE },
  ]
  const [air, landed, last] = parseItinerary(programme)

  it('no bed, no city, no sights, no meals, no services, no ticket — and it is not an "unstated" day', () => {
    expect(air).toMatchObject({
      in_transit: true, city: '', accommodation_type: 'none', attractions: [], attraction_ids: [],
      meals: NONE, transport_type: undefined, unstated: false, sightseeingUnstated: false,
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
    })
  })
  it('the ARRIVAL moves to the day they land: its transfer, meet & greet and check-in', () => {
    expect(landed.services).toMatchObject({ airport_arrival: true, hotel_checkin: true, airport_departure: false })
    expect(last.services).toMatchObject({ airport_departure: true, hotel_checkout: true })
  })
  it('without the flag the same first day is the arrival, as it always was', () => {
    const [first, second] = parseItinerary(programme.map((d, i) => (i === 0 ? { ...d, in_transit: undefined, services: undefined } : d)))
    expect(first.services.airport_arrival).toBe(true)
    expect(second.services.airport_arrival).toBe(false)
  })
  it('no tip is for a day in the air, and no leg starts or ends there', () => {
    expect(tipOccasionsFor([air, landed, last])[0]).toMatchObject({ sightseeing: null, restaurantMeals: 0, transfers: 0, airportServices: 0, night: null })
    expect(collectTicketLegs([
      { day: 1, city: 'Cairo', in_transit: true, transport_type: 'flight' } as never,
      { day: 2, city: 'Luxor', transport_type: 'flight' },
    ])).toEqual([]) // day 2 has no grounded yesterday: it needs its own From, like any first day
  })
  it('a day in the air MID-programme does not make the next day a road transfer from nowhere', () => {
    const days = parseItinerary([
      { day: 1, city: 'Cairo', meals: NONE, attractions: ['Giza Plateau'] },
      { day: 2, in_transit: true, meals: NONE },
      { day: 3, city: 'Cairo', meals: NONE, attractions: ['Egyptian Museum'] },
      { day: 4, city: 'Cairo', meals: NONE },
    ])
    expect(days[2].city).toBe('Cairo')
    expect(tipOccasionsFor(days)[2].transfers).toBe(0) // '' → Cairo is not a journey
    expect(tipOccasionsFor(days)[3].transfers).toBe(1) // the departure, on the last day on the ground
  })
})

describe('priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const price = async (days: unknown[]) => {
    const t = fullRateTables()
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: days, duration_days: days.length, tour_type: 'multi_day' }]
    setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const base = (cairoTemplateRow.itinerary as Array<Record<string, unknown>>)

  it('putting the flight out in front adds NOTHING to the price, and no line on that day', async () => {
    const plain = await price(base)
    const shifted = [{ day: 1, title: 'Overnight flight', in_transit: true, city: 'Cairo', accommodation_type: 'hotel', meals: { breakfast: 'none', lunch: 'external', dinner: 'none' } },
      ...base.map(d => ({ ...d, day: Number(d.day) + 1 }))]
    const withFlight = await price(shifted)
    // (The water line is one whole-trip line the engine files under day 1.)
    expect(withFlight.services.filter(s => s.dayNumber === 1 && s.id !== 'water-all-days')).toEqual([])
    expect(withFlight.holes.filter(h => h.dayNumber === 1)).toEqual([])
    const pp = (r: typeof plain) => r.paxPricing.find(p => p.numPax === 2)!.withoutLeader.pricePerPerson
    expect(pp(withFlight)).toBe(pp(plain))
    expect(withFlight.hotelNights).toBe(plain.hotelNights)
  })
})

const FORM: DayForm = { title: 'Overnight flight', description: '', meals: {}, picked: [], transportType: '', transportRateId: '', city: '', night: 'in_transit', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false }

describe('the day editor', () => {
  it('"In the air" stores the flag, the kind and no bed', () => {
    expect(applyDayForm(null, FORM, 1)).toMatchObject({ in_transit: true, overnight_kind: 'flight', accommodation_type: 'none' })
  })
  it('choosing any other night takes it back; a train or cruise marker is left alone', () => {
    const back = applyDayForm({ day: 1, in_transit: true, overnight_kind: 'flight', accommodation_type: 'none' }, { ...FORM, night: 'hotel' }, 1)
    expect(back.in_transit).toBeUndefined(); expect(back.overnight_kind).toBeUndefined(); expect(back.accommodation_type).toBe('hotel')
    expect(applyDayForm({ day: 1, overnight_kind: 'train' }, { ...FORM, night: 'none' }, 1).overnight_kind).toBe('train')
  })
  it('leaving Night alone leaves an in-the-air day in the air', () => {
    expect(applyDayForm({ day: 1, in_transit: true, overnight_kind: 'flight' }, { ...FORM, night: '' }, 1).in_transit).toBe(true)
  })
  it('offers the option, explains it, and hides the hotel picker for it', () => {
    const page = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
    expect(page).toContain('<option value="in_transit">In the air (overnight flight) — nothing is sold this day</option>')
    expect(page).toContain('moves to the next day on the ground')
    expect(page).toContain("dayNight !== 'in_transit' && dayCity.trim()")
    expect(page).toContain("'In the air — nothing sold'")
  })
})

describe('the days sheet', () => {
  const tour = [{ template_code: 'FLYIN', itinerary: [
    { day: 1, title: 'Overnight flight', in_transit: true, overnight_kind: 'flight', accommodation_type: 'none', meals: NONE },
    { day: 2, title: 'Cairo', city: 'Cairo', accommodation_type: 'hotel', meals: NONE, attractions: ['Giza Plateau'], services: { guide_required: true } },
  ] }]
  it('writes "in_the_air" in Accommodation and reads it back as the same day', () => {
    const csv = serializeDaysCsv(tour)
    expect(csv).toContain('in_the_air')
    const parsed = parseDaysCsv(csv, papa)
    expect(parsed.refused).toEqual([])
    const [air, cairo] = parsed.byTemplate.get('FLYIN')!
    expect(air).toMatchObject({ in_transit: true, overnight_kind: 'flight', accommodation_type: 'none' })
    expect((cairo as Record<string, unknown>).in_transit).toBeUndefined()
  })
})

// ── the other half of sibling #456: a night that names a property no longer in Rates ──
import { propertyRateStatus, propertyKey } from '@/lib/itineraries/overnight-property'

describe('is the night’s hotel or ship still in the rates?', () => {
  const catalog = {
    hotels: [{ name: 'Kempinski Nile Hotel ', active: true }, { name: 'Old Winter Palace', active: false }, { name: 'Twin', active: false }, { name: 'twin', active: true }],
    ships: [{ name: 'MS Nile Star', active: true }],
  }
  it('names compare ignoring case, spacing and a trailing space', () => {
    expect(propertyKey('  Kempinski   NILE hotel ')).toBe('kempinski nile hotel')
    expect(propertyRateStatus({ kind: 'hotel', name: 'kempinski nile hotel' }, catalog)).toBe('on_file')
  })
  it('switched off, gone, and one ACTIVE row among several is enough', () => {
    expect(propertyRateStatus({ kind: 'hotel', name: 'Old Winter Palace' }, catalog)).toBe('switched_off')
    expect(propertyRateStatus({ kind: 'hotel', name: 'Sofitel Legend' }, catalog)).toBe('not_on_file')
    expect(propertyRateStatus({ kind: 'hotel', name: 'Twin' }, catalog)).toBe('on_file')
  })
  it('a ship is looked for among ships, never among hotels', () => {
    expect(propertyRateStatus({ kind: 'cruise', name: 'MS Nile Star' }, catalog)).toBe('on_file')
    expect(propertyRateStatus({ kind: 'cruise', name: 'Kempinski Nile Hotel' }, catalog)).toBe('not_on_file')
  })
  it('the days API reports it per night line, withholds it when a catalogue failed to load, and only staff pages read it', () => {
    const api = readFileSync(join(process.cwd(), 'app/api/itineraries/[id]/days/route.ts'), 'utf8')
    expect(api).toContain('property && loadedFor[property.kind] ? propertyRateStatus(property, catalog) : null')
    expect(readFileSync(join(process.cwd(), 'app/itineraries/[id]/page.tsx'), 'utf8')).toContain('data-testid="overnight-stale"')
    for (const clientFacing of ['app/share/[token]/page.tsx', 'lib/pdf-generator.ts']) {
      expect(readFileSync(join(process.cwd(), clientFacing), 'utf8'), clientFacing).not.toContain('property_rate_status')
    }
  })
})
