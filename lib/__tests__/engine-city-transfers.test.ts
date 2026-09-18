// A day tour is the sightseeing. A city transfer is getting somewhere else in
// town — the sound & light show, the market in Luxor or Aswan, an evening out
// (operator, 2026-09-18). They are different rates and a day can need BOTH.
//
// The engine only ever asked for ONE thing per day, so on production 398 City
// Transfer rows and 30 Outside Dinner Transfer rows were unreachable.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, extraTransfersFor } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const day = (over: Record<string, unknown> = {}) =>
  ({
    day: 2,
    city: 'Luxor',
    meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
    services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
    ...over,
  }) as never

describe('what a day asks for besides its sightseeing', () => {
  it('nothing, ordinarily', () => {
    expect(extraTransfersFor(day())).toEqual([])
  })

  it('a dinner transfer when they eat out — which the day already states', () => {
    const extras = extraTransfersFor(day({ meals: { breakfast: 'included', lunch: 'none', dinner: 'external' } }))
    expect(extras.map(e => e.serviceType)).toEqual(['outside_dinner'])
  })

  it('a local transfer when the operator ticks it — the market, sound & light', () => {
    // "City Transfer" and "Transfer Within City" are the same thing, and the
    // operator is populating the latter; the older key is still tried.
    const [extra] = extraTransfersFor(day({ city_transfer: true }))
    expect(extra.serviceType).toBe('transfer_within_city')
    expect(extra.alsoTry).toEqual(['city_transfer'])
  })

  it('both, because a day can need both', () => {
    const extras = extraTransfersFor(
      day({ city_transfer: true, meals: { breakfast: 'included', lunch: 'none', dinner: 'external' } })
    )
    expect(extras.map(e => e.serviceType)).toEqual(['outside_dinner', 'transfer_within_city'])
  })

  it('never asks because of a WORD in the title', () => {
    expect(extraTransfersFor(day({ title: 'Sound and Light show, then the market' }))).toEqual([])
  })
})

const transportRow = (service_type: string, city: string, rate: number) => ({
  id: `t-${service_type}-${city}`,
  service_type,
  city,
  destination_city: null,
  origin_city: null,
  // NULL, as every production row has: the service type carries the length.
  duration: null,
  area: null,
  vehicle_type: 'Sedan',
  base_rate_eur: rate,
  is_active: true,
})

async function priceWith(rows: Array<Record<string, unknown>>, dayPatch: Record<string, unknown>) {
  const tables = fullRateTables()
  tables.transportation_rates = rows
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  Object.assign(template.itinerary[1], dayPatch)
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

describe('the rates those days reach', () => {
  it('prices a local transfer from the City Transfer rates', async () => {
    const result = await priceWith([transportRow('city_transfer', 'Cairo', 40)], { city_transfer: true })
    const line = result.services.find(s => s.id.endsWith('-city-transfer'))
    expect(line?.unitCost).toBe(40)
    expect(line?.unpriced).toBeUndefined()
  })

  it('prices a dinner transfer from the Outside Dinner rates', async () => {
    const result = await priceWith([transportRow('outside_dinner', 'Cairo', 25)], {
      meals: { breakfast: 'included', lunch: 'none', dinner: 'external' },
    })
    const line = result.services.find(s => s.id.endsWith('-dinner-transfer'))
    expect(line?.unitCost).toBe(25)
  })

  it('records a gap when the city has no such rate, rather than using a day-tour rate', async () => {
    const result = await priceWith([transportRow('day_tour', 'Cairo', 120)], { city_transfer: true })
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.message.includes('local transfer'))
    expect(hole).toBeTruthy()
    expect(result.services.some(s => s.id.endsWith('-city-transfer') && s.unitCost === 120)).toBe(false)
  })

  it('does not charge one on a day that asks for neither', async () => {
    const result = await priceWith([transportRow('city_transfer', 'Cairo', 40)], {})
    expect(result.services.some(s => s.id.endsWith('-city-transfer'))).toBe(false)
  })
})

describe('against rows shaped like production\'s', () => {
  it('prices a row whose duration is NULL — which is all 2,040 of them', async () => {
    const result = await priceWith([transportRow('city_transfer', 'Cairo', 40)], { city_transfer: true })
    const line = result.services.find(s => s.id.endsWith('-city-transfer'))
    // Asking for a duration would match this row only APPROXIMATELY, which
    // becomes a gap — a rate that exists, reported as missing.
    expect(line?.unitCost).toBe(40)
    expect(result.holes.some(h => h.message.includes('local transfer'))).toBe(false)
  })
})

describe('the length of a day\'s sightseeing is its route', () => {
  // Half day is four hours, a day tour eight, a long day tour twelve
  // (operator, 2026-09-18), and the agency prices those as different routes.
  it('asks for the route the day says it is', async () => {
    for (const [length, rate] of [['half_day', 60], ['long_day_tour', 200]] as const) {
      const result = await priceWith([transportRow(length, 'Cairo', rate)], { sightseeing_length: length })
      const line = result.services.find(s => s.id.endsWith('-transport'))
      expect(line?.unitCost, length).toBe(rate)
    }
  })

  it('is a full day tour when the day does not say, exactly as before', async () => {
    const result = await priceWith([transportRow('day_tour', 'Cairo', 120)], {})
    expect(result.services.find(s => s.id.endsWith('-transport'))?.unitCost).toBe(120)
  })

  it('does not fall back to the day-tour rate for a half day', async () => {
    const result = await priceWith([transportRow('day_tour', 'Cairo', 120)], { sightseeing_length: 'half_day' })
    expect(result.services.some(s => s.id.endsWith('-transport') && s.unitCost === 120)).toBe(false)
    expect(result.complete).toBe(false)
  })

  it('finds an older City Transfer row while Transfer Within City is being filled in', async () => {
    const result = await priceWith([transportRow('city_transfer', 'Cairo', 40)], { city_transfer: true })
    expect(result.services.find(s => s.id.endsWith('-city-transfer'))?.unitCost).toBe(40)
  })

  it('prefers Transfer Within City when both exist', async () => {
    const result = await priceWith(
      [transportRow('city_transfer', 'Cairo', 40), transportRow('transfer_within_city', 'Cairo', 55)],
      { city_transfer: true }
    )
    expect(result.services.find(s => s.id.endsWith('-city-transfer'))?.unitCost).toBe(55)
  })
})
