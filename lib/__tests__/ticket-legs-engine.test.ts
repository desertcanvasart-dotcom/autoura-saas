import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables } from './fixtures/sample-templates'

// ============================================
// Ticket legs through the whole engine (B-item 2)
// ============================================
// Flights: fare + tax per person, economy only, road suppressed. Trains:
// per-person fare, the road intercity line suppressed, no station
// transfers. Sleepers: the ticket IS the bed — no hotel that night, the
// single-cabin gap joins the rooming supplement, the station alias holds,
// and the throughout guide rides a single cabin at its guide_rate.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const TID = 'tmpl-tickets'
const BASE_PARAMS = {
  templateId: TID,
  tenantId: 'test-tenant',
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

const noServices = {
  airport_arrival: false,
  airport_departure: false,
  hotel_checkin: false,
  hotel_checkout: false,
  guide_required: false,
}

function ticketTables(
  itinerary: Array<Record<string, unknown>>,
  extra?: Partial<Record<'flight_rates' | 'train_rates' | 'sleeping_train_rates', Array<Record<string, unknown>>>>
) {
  const tables = fullRateTables()
  tables.tour_templates = [
    {
      id: TID,
      template_name: 'Ticket Legs Test',
      template_code: 'TKT',
      duration_days: itinerary.length,
      tour_type: 'classic',
      category_id: null,
      itinerary,
    },
  ]
  // A Luxor hotel so multi-city nights stay priceable.
  tables.accommodation_rates = [
    ...tables.accommodation_rates,
    { id: 'h-lxr-std', property_name: 'Luxor Grand', city: 'Luxor', tier: 'standard', ppd_eur: 40, single_supplement_eur: 20, triple_reduction_eur: 0, is_active: true },
  ]
  tables.flight_rates = extra?.flight_rates ?? []
  tables.train_rates = extra?.train_rates ?? []
  tables.sleeping_train_rates = extra?.sleeping_train_rates ?? []
  return tables
}

const day = (n: number, city: string, over?: Record<string, unknown>) => ({
  day: n,
  title: `Day ${n}`,
  city,
  accommodation_type: 'hotel',
  meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
  attractions: [],
  services: { ...noServices },
  ...over,
})

const FLIGHT = { id: 'fl-1', airline: 'EgyptAir', flight_number: 'MS123', cabin_class: 'economy', route_from: 'Cairo', route_to: 'Luxor', base_rate_eur: 100, tax_eur: 20, is_active: true }
const SLEEPER_PAIR = [
  { id: 'slp-dbl', origin_city: 'Cairo', destination_city: 'Luxor', cabin_type: 'double_cabin', rate_oneway_eur: 120, operator_name: 'Watania', is_active: true },
  { id: 'slp-sgl', origin_city: 'Cairo', destination_city: 'Luxor', cabin_type: 'single_cabin', rate_oneway_eur: 180, guide_rate: 90, operator_name: 'Watania', is_active: true },
]

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('flights', () => {
  it('fare + tax per person, and the intercity ROAD line is suppressed', async () => {
    setMockTables(ticketTables(
      [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' }), day(3, 'Luxor', { accommodation_type: 'none' })],
      { flight_rates: [FLIGHT] }
    ))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const flight = r.services.find(s => s.serviceType === 'flight')!
    expect(flight.unitCost).toBe(120) // 100 fare + 20 tax
    expect(flight.isPerPax).toBe(true)
    // No road transport line for the flight day.
    expect(r.services.some(s => s.serviceType === 'transportation' && s.dayNumber === 2)).toBe(false)
    expect(r.complete).toBe(true)
  })

  it('only the ECONOMY cabin is a candidate', async () => {
    setMockTables(ticketTables(
      [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })],
      { flight_rates: [{ ...FLIGHT, id: 'fl-biz', cabin_class: 'business', base_rate_eur: 400 }] }
    ))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => /No economy flight rate/.test(h.message))).toBe(true)
  })
})

describe('day trains — the never-guess selection', () => {
  const TRAIN_A = { id: 'tr-a', origin_city: 'Cairo', destination_city: 'Luxor', operator_name: 'OD Train', class_type: 'first', rate_eur: 45, is_active: true }
  const TRAIN_B = { id: 'tr-b', origin_city: 'Cairo', destination_city: 'Luxor', operator_name: 'Express', class_type: 'second', rate_eur: 30, is_active: true }
  const days2 = [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })]

  it('two matching trains are an ambiguity hole NAMING both', async () => {
    setMockTables(ticketTables(days2, { train_rates: [TRAIN_A, TRAIN_B] }))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(false)
    const hole = r.holes.find(h => /Several trains/.test(h.message))!
    expect(hole.message).toContain('OD Train')
    expect(hole.message).toContain('Express')
  })

  it('naming THE train resolves the ambiguity', async () => {
    setMockTables(ticketTables(
      [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', transport_rate_id: 'tr-b' })],
      { train_rates: [TRAIN_A, TRAIN_B] }
    ))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(true)
    const train = r.services.find(s => s.serviceName.startsWith('Train'))!
    expect(train.unitCost).toBe(30)
  })

  it('a named-but-deleted row is its own re-pick hole', async () => {
    setMockTables(ticketTables(
      [day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', transport_rate_id: 'tr-gone' })],
      { train_rates: [TRAIN_A] }
    ))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => /re-pick/.test(h.message))).toBe(true)
  })
})

describe('sleeping trains — the ticket IS the bed', () => {
  const sleeperDays = [
    day(1, 'Cairo', { transport_type: 'sleeping_train' }),
    day(2, 'Luxor'),
    day(3, 'Luxor', { accommodation_type: 'none' }),
  ]

  it('no hotel that night; everyone at half twin; the single gap joins the rooming supplement', async () => {
    setMockTables(ticketTables(sleeperDays, { sleeping_train_rates: SLEEPER_PAIR }))
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(true)
    // Day 1's hotel bed is gone: only day 2's Luxor night remains.
    expect(r.hotelNights).toBe(1)
    const sleeper = r.services.find(s => s.serviceName.startsWith('Sleeping train'))!
    expect(sleeper.unitCost).toBe(120)
    expect(sleeper.isPerPax).toBe(true)
    // Rooming: Luxor night's 20 + the sleeper's single gap (180 − 120).
    expect(r.singleSupplement).toBe(80)
  })

  it('the station alias holds: a sleeper "from Giza" rides the Cairo row', async () => {
    setMockTables(ticketTables(
      [day(1, 'Giza', { transport_type: 'sleeping_train' }), day(2, 'Luxor'), day(3, 'Luxor', { accommodation_type: 'none' })],
      { sleeping_train_rates: SLEEPER_PAIR }
    ))
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS })
    expect(r.services.some(s => s.serviceName.startsWith('Sleeping train'))).toBe(true)
  })

  it("the throughout guide rides a SINGLE cabin at the single row's guide_rate", async () => {
    setMockTables(ticketTables(sleeperDays, { sleeping_train_rates: SLEEPER_PAIR }))
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS, guideMode: 'throughout', requestedPax: 2 })
    const berth = r.services.find(s => s.serviceName.includes('sleeper single cabin'))!
    expect(berth.unitCost).toBe(90) // guide_rate, not the 180 single fare
    expect(berth.isPerPax).toBe(false)
  })
})
