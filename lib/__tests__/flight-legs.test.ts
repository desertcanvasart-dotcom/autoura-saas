// A flight names its own route, and its airport assistance (sibling #458).
//
// A ticket leg always ran from the previous day's city to this day's. That
// cannot say a CONNECTION: the party lands in Cairo on the international flight
// and flies straight on to Luxor — on day 1, where there is no previous city.
// The Cairo → Luxor ticket was never asked for, and the only airport help the
// engine knew was one meet & greet at the day's own city.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, parseItinerary, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { legRoute, legAssistance, routeAirportCode, knownAirportCode, sanitizeLegAssist, sanitizeLegPlace, arrivalDayIndex } from '@/lib/pricing/flight-leg'
import { collectTicketLegs } from '@/lib/pricing/ticket-legs'
import { applyDayForm, type DayForm } from '@/lib/tours/day-edit'
import Papa from 'papaparse'
import { parseDaysCsv, serializeDaysCsv, DAY_CSV_COLUMNS } from '@/lib/tours/itinerary-csv'

const papa = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }) as never

describe('the route a leg runs', () => {
  it('yesterday → today, unless the day names its own', () => {
    expect(legRoute('flight', { city: 'Luxor' }, { city: 'Cairo' }, null)).toMatchObject({ from: 'Cairo', to: 'Luxor', fromStated: false })
    expect(legRoute('flight', { city: 'Luxor', leg_from: ' Cairo ', leg_to: 'Aswan' }, { city: 'Giza' }, null)).toMatchObject({ from: 'Cairo', to: 'Aswan', fromStated: true, toStated: true })
  })
  it('a sleeper boards tonight and wakes in TOMORROW’s city', () => {
    expect(legRoute('sleeping_train', { city: 'Cairo' }, { city: 'Alexandria' }, { city: 'Aswan' })).toMatchObject({ from: 'Cairo', to: 'Aswan' })
  })
  it('DAY 1 has no yesterday: no route until the day names one — the connection', () => {
    const days = [{ day: 1, city: 'Luxor', transport_type: 'flight' as const }, { day: 2, city: 'Luxor' }]
    expect(collectTicketLegs(days)).toEqual([])
    expect(collectTicketLegs([{ ...days[0], leg_from: 'Cairo' }, days[1]])).toEqual([
      { mode: 'flight', from: 'Cairo', to: 'Luxor', dayNumber: 1, namedRateId: undefined },
    ])
  })
  it('the same place at both ends is nothing to ride — Cairo and Giza are one station', () => {
    expect(collectTicketLegs([{ day: 1, city: 'Cairo' }, { day: 2, city: 'Giza', transport_type: 'train' }])).toEqual([])
    expect(collectTicketLegs([{ day: 1, city: 'Cairo' }, { day: 2, city: 'Luxor', transport_type: 'flight', leg_from: 'Luxor' }])).toEqual([])
  })
  it('existing programmes collect exactly the legs they did', () => {
    expect(collectTicketLegs([
      { day: 1, city: 'Cairo' }, { day: 2, city: 'Luxor', transport_type: 'flight', transport_rate_id: 'f1' },
      { day: 3, city: 'Luxor', transport_type: 'sleeping_train' }, { day: 4, city: 'Cairo' },
    ])).toEqual([
      { mode: 'flight', from: 'Cairo', to: 'Luxor', dayNumber: 2, namedRateId: 'f1' },
      { mode: 'sleeping_train', from: 'Luxor', to: 'Cairo', dayNumber: 3, namedRateId: undefined },
    ])
  })
})

describe('airports and assistance', () => {
  it('a city on file, or a typed three-letter code; anything else is NOT Cairo', () => {
    expect(routeAirportCode('Luxor')).toBe('LXR')
    expect(routeAirportCode(' nrt ')).toBe('NRT')
    expect(routeAirportCode('Marsa Alam')).toBeNull()
    expect(knownAirportCode('NRT')).toBeNull()
  })
  it('the arrival day defaults BOTH ends on; any other flight day, both off; what the day says wins', () => {
    expect(legAssistance(undefined, true)).toEqual({ from: true, to: true })
    expect(legAssistance(undefined, false)).toEqual({ from: false, to: false })
    expect(legAssistance({ to: false }, true)).toEqual({ from: true, to: false })
    expect(legAssistance({ from: true }, false)).toEqual({ from: true, to: false })
  })
  it('the arrival day is the first day', () => {
    expect(arrivalDayIndex([{}, {}])).toBe(0)
    expect(arrivalDayIndex([])).toBe(-1)
  })
  it('only real values are stored', () => {
    expect(sanitizeLegPlace('  Cairo   International ')).toBe('Cairo International')
    expect(sanitizeLegPlace('')).toBeUndefined()
    expect(sanitizeLegAssist({ from: 'yes', to: true })).toEqual({ to: true })
    expect(sanitizeLegAssist({})).toBeUndefined()
  })
})

describe('the engine reads the leg only on a day that travels by ticket', () => {
  it('flight: route and assistance; train: route only; road: neither', () => {
    const [flight, train, road] = parseItinerary([
      { day: 1, city: 'Luxor', transport_type: 'flight', leg_from: 'Cairo', leg_assist: { to: false } },
      { day: 2, city: 'Aswan', transport_type: 'train', leg_from: 'Luxor', leg_assist: { to: true } },
      { day: 3, city: 'Aswan', leg_from: 'Cairo', leg_assist: { to: true } },
    ])
    expect(flight).toMatchObject({ leg_from: 'Cairo', leg_assist: { to: false } })
    expect(train.leg_from).toBe('Luxor'); expect(train.leg_assist).toBeUndefined()
    expect(road.leg_from).toBeUndefined(); expect(road.leg_assist).toBeUndefined()
  })
})

// ── priced ───────────────────────────────────────────────────────────────────
describe('a connection on the arrival day, priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  const tables = (day1: Record<string, unknown>, day2: Record<string, unknown> = {}) => {
    const t = fullRateTables()
    const days = [
      { day: 1, title: 'Arrive and connect', city: 'Luxor', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, accommodation_type: 'none',
        services: { airport_arrival: true, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }, ...day1 },
      { day: 2, title: 'Departure', city: 'Luxor', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, accommodation_type: 'none',
        services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }, ...day2 },
    ]
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: days, duration_days: 2, tour_type: 'multi_day' }]
    t.flight_rates = [{ id: 'fl-1', airline: 'EgyptAir', flight_number: 'MS 61', cabin_class: 'economy', route_from: 'Cairo', route_to: 'Luxor', base_rate_eur: 90, tax_eur: 10, base_rate_non_eur: 90, tax_non_eur: 10, is_active: true }]
    t.airport_staff_rates = [
      { id: 'a1', airport_code: 'CAI', direction: 'arrival', service_type: 'meet_greet', rate_eur: 30, is_active: true },
      { id: 'a2', airport_code: 'LXR', direction: 'arrival', service_type: 'meet_greet', rate_eur: 20, is_active: true },
      { id: 'a3', airport_code: 'CAI', direction: 'departure', service_type: 'meet_greet', rate_eur: 25, is_active: true },
    ]
    return t
  }
  const price = async () => calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  const airport = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'airport_service').map(s => `${s.serviceName} = ${s.unitCost}`)

  it('before: day 1 flies with no route — NO ticket, and the meet & greet is at the day’s city', async () => {
    setMockTables(tables({ transport_type: 'flight' }))
    const r = await price()
    expect(r.services.some(s => /EgyptAir|MS 61|Cairo/.test(s.serviceName) && s.serviceType !== 'airport_service')).toBe(false)
    expect(airport(r)).toEqual(['Airport Meet & Greet (LXR) = 20'])
  })

  it('the connection: the Cairo → Luxor ticket, met at CAIRO where the flight lands, and assisted again at Luxor', async () => {
    setMockTables(tables({ transport_type: 'flight', leg_from: 'Cairo' }))
    const r = await price()
    expect(r.holes.filter(h => h.kind === 'airport_service' || h.kind === 'transport').map(h => h.lookupAttempted)).not.toContain('flight Cairo → Luxor')
    expect(airport(r).sort()).toEqual([
      'Airport Arrival Assistance (LXR) — Cairo → Luxor = 20',
      'Airport Meet & Greet (CAI) = 30',
    ])
  })

  it('unticking Luxor keeps the meet & greet and drops the second', async () => {
    setMockTables(tables({ transport_type: 'flight', leg_from: 'Cairo', leg_assist: { to: false } }))
    expect(airport(await price())).toEqual(['Airport Meet & Greet (CAI) = 30'])
  })

  it('unticking the landing drops the meet & greet — the box decides it on a connection day', async () => {
    setMockTables(tables({ transport_type: 'flight', leg_from: 'Cairo', leg_assist: { from: false } }))
    expect(airport(await price())).toEqual(['Airport Arrival Assistance (LXR) — Cairo → Luxor = 20'])
  })

  it('a place with no airport on file is a gap that NAMES it — never priced as Cairo', async () => {
    setMockTables(tables({ transport_type: 'flight', leg_from: 'Marsa Matruh' }))
    const r = await price()
    expect(airport(r)).toEqual(['Airport Arrival Assistance (LXR) — Marsa Matruh → Luxor = 20'])
    expect(r.holes.some(h => h.kind === 'airport_service' && /No airport is on file for "Marsa Matruh"/.test(h.message))).toBe(true)
  })

  it('a mid-trip flight: no assistance unless ticked; ticked, both ends — departure at the origin, arrival at the destination', async () => {
    const mid = { city: 'Luxor', transport_type: 'flight' }
    setMockTables(tables({ city: 'Cairo', services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false } }, mid))
    expect(airport(await price())).toEqual([])
    setMockTables(tables({ city: 'Cairo', services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false } }, { ...mid, leg_assist: { from: true, to: true } }))
    expect(airport(await price()).sort()).toEqual([
      'Airport Arrival Assistance (LXR) — Cairo → Luxor = 20',
      'Airport Departure Assistance (CAI) — Cairo → Luxor = 25',
    ])
  })
})

// ── saved, and round-tripped ─────────────────────────────────────────────────
const FORM: DayForm = { title: 'Day', description: '', meals: {}, picked: [], transportType: 'flight', transportRateId: '', city: 'Luxor', night: '', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false }

describe('the day editor saves what was set, and nothing else', () => {
  it('a route and the ticked end', () => {
    const day = applyDayForm(null, { ...FORM, legFrom: ' Cairo ', legAssist: { to: false } }, 1)
    expect(day).toMatchObject({ transport_type: 'flight', leg_from: 'Cairo', leg_assist: { to: false } })
    expect(day.leg_to).toBeUndefined()
  })
  it('an end left alone is not stored — it keeps the day’s default', () => {
    expect(applyDayForm(null, { ...FORM, legFrom: 'Cairo', legAssist: {} }, 1).leg_assist).toBeUndefined()
  })
  it('a day that stops flying loses its assistance; one that goes back to road loses the leg too', () => {
    const flew = { day: 2, transport_type: 'flight', leg_from: 'Cairo', leg_to: 'Aswan', leg_assist: { to: true }, services: { guide_required: true } }
    const train = applyDayForm(flew, { ...FORM, transportType: 'train', legFrom: 'Cairo', legTo: 'Aswan', legAssist: { to: true } }, 2)
    expect(train).toMatchObject({ transport_type: 'train', leg_from: 'Cairo', leg_to: 'Aswan' }); expect(train.leg_assist).toBeUndefined()
    const road = applyDayForm(flew, { ...FORM, transportType: '', legFrom: 'Cairo' }, 2)
    expect(road.leg_from).toBeUndefined(); expect(road.leg_to).toBeUndefined(); expect(road.leg_assist).toBeUndefined()
    expect(road.services).toEqual({ guide_required: true }) // and nothing else is touched
  })
})

describe('the days sheet carries it both ways', () => {
  const template = { id: 't1', template_code: 'CONNECT', itinerary: [
    { day: 1, title: 'Arrive', city: 'Luxor', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, transport_type: 'flight', leg_from: 'Cairo', leg_assist: { to: false }, services: { airport_arrival: true } },
    { day: 2, title: 'Tour', city: 'Luxor', meals: { breakfast: 'included', lunch: 'none', dinner: 'none' }, attractions: ['Karnak Temple'], services: { guide_required: true } },
  ] }
  it('has the four columns', () => {
    expect(DAY_CSV_COLUMNS.map(c => c.name)).toEqual(expect.arrayContaining(['leg_from', 'leg_to', 'leg_assist_from', 'leg_assist_to']))
  })
  it('export → import gives the same leg back; "not stated" stays not stated', () => {
    const csv = serializeDaysCsv([template])
    const parsed = parseDaysCsv(csv, papa)
    expect(parsed.refused).toEqual([])
    const day1 = parsed.byTemplate.get('CONNECT')![0] as Record<string, unknown>
    expect(day1).toMatchObject({ transport_type: 'flight', leg_from: 'Cairo', leg_assist: { to: false } })
    expect(day1.leg_to).toBeUndefined()
    const day2 = parsed.byTemplate.get('CONNECT')![1] as Record<string, unknown>
    expect(day2.leg_from).toBeUndefined(); expect(day2.leg_assist).toBeUndefined()
  })
})

describe('the editor shows what pricing will read', () => {
  const page = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
  it('route fields with the usual route greyed, a first-day warning, and the two assistance boxes', () => {
    expect(page).toContain('placeholder={usualLeg.from ||')
    expect(page).toContain('This is the first day, so there is no previous city to leave from')
    expect(page).toContain('Meet & greet on landing')
    expect(page).toContain('Arrival assistance')
    expect(page).toContain('legAssistance(dayLegAssist, isArrivalDayForm)')
  })
  it('the shared rule stays import-free (the editor is a client component)', () => {
    expect(readFileSync(join(process.cwd(), 'lib/pricing/flight-leg.ts'), 'utf8')).not.toMatch(/^import /m)
  })
})

describe('the days sheet refuses a leg on a day that cannot have one', () => {
  const header = DAY_CSV_COLUMNS.map(c => c.label).join(',')
  const row = (over: Record<string, string>) => {
    const base: Record<string, string> = { template_code: 'T', day: '1', title: 'Day', city: 'Luxor', breakfast: 'none', lunch: 'none', dinner: 'none', transport_type: 'road', sightseeing: 'none', ...over }
    return DAY_CSV_COLUMNS.map(c => base[c.name] ?? '').join(',')
  }
  it('a route on a ROAD day', () => {
    const r = parseDaysCsv(`${header}\n${row({ leg_from: 'Cairo' })}`, papa)
    expect(r.refused[0]?.reason).toMatch(/Leg From \/ Leg To name a ticket's route, but Transport is road/)
  })
  it('airport assistance on a day that does not FLY', () => {
    const r = parseDaysCsv(`${header}\n${row({ transport_type: 'train', leg_assist_to: 'yes' })}`, papa)
    expect(r.refused[0]?.reason).toMatch(/is airport assistance, and the day does not fly/)
  })
  it('anything but yes / no in an assistance cell', () => {
    const r = parseDaysCsv(`${header}\n${row({ transport_type: 'flight', leg_assist_to: 'maybe' })}`, papa)
    expect(r.refused).toHaveLength(1)
  })
})
