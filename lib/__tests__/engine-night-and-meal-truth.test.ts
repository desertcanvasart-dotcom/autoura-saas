// Three ways the engine priced something that was not true.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, getHotelRates, getCruiseRates, parseItinerary } from '@/lib/auto-pricing-service'

const SCOPE = { tenantId: 'test-tenant' }
const TRAVEL = '2026-11-10'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

// ============================================================================
// 1. A period whose nightly rate is blank must not price the night at zero.
//    The rate editor stores a blank as 0, and the engine returned that 0 as a
//    real 'db' rate: a free hotel or cruise on the quote, with no hole.
// ============================================================================
const withPeriod = (rate: number) => [{
  id: 'h1', property_name: 'Nile Palace', city: 'Cairo', tier: 'standard', is_active: true,
  ppd_eur: rate, single_supplement_eur: 0, triple_reduction_eur: 0,
  seasons: [{ name: 'Winter', from: '2026-11-01', to: '2027-02-28', rates: { ppd_eur: rate, single_supplement_eur: 0, triple_reduction_eur: 0, guide_rate_eur: 0 } }],
}]

describe('a blank nightly rate in the covering period', () => {
  it('hotel: is a miss, not a 0 price', async () => {
    setMockTables({ accommodation_rates: withPeriod(0) })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard', TRAVEL)
    expect(r?.source).toBe('missing')
    expect(r?.ppdNight).toBe(0)
    expect(r?.periodBlank?.periodName).toBe('Winter')
  })

  it('hotel: a filled period still prices', async () => {
    setMockTables({ accommodation_rates: withPeriod(120) })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard', TRAVEL)
    expect(r?.source).toBe('db')
    expect(r?.ppdNight).toBe(120)
  })

  it('cruise: is a miss, not a 0 price', async () => {
    setMockTables({ nile_cruises: [{
      id: 'c1', ship_name: 'Sun Boat', tier: 'standard', is_active: true, duration_nights: 3,
      ppd_eur: 0, single_supplement_eur: 0, triple_reduction_eur: 0,
      seasons: [{ name: 'Winter', from: '2026-11-01', to: '2027-02-28', rates: { ppd_eur: 0, single_supplement_eur: 0, triple_reduction_eur: 0, guide_rate_eur: 0 } }],
    }] })
    const r = await getCruiseRates(SCOPE, 'standard', undefined, TRAVEL)
    expect(r?.source).toBe('missing')
    expect(r?.periodBlank?.periodName).toBe('Winter')
  })

  it('the operator is told which period to fill', async () => {
    const tables = fullRateTables()
    tables.accommodation_rates = withPeriod(0)
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    tables.tour_templates = [template]
    setMockTables(tables)
    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25, travelDate: TRAVEL,
    })
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'hotel')
    expect(hole?.message).toContain('Winter')
    expect(hole?.message).toContain('no nightly rate')
    expect(result.services.some(s => s.serviceType === 'accommodation')).toBe(false)
  })
})

// ============================================================================
// 2. Meals written as a LIST were all read as "included in the hotel", so a
//    restaurant lunch or dinner was never charged and no hole was recorded.
//    The only writer of the list form (create-template-from-itinerary) listed
//    a meal exactly when the day had a restaurant meal service.
// ============================================================================
describe('the old list format for meals', () => {
  const parse = (meals: unknown) => parseItinerary([{ day: 1, title: 'Day', city: 'Cairo', meals }])[0].meals

  it('a listed lunch or dinner is a restaurant meal, and gets priced', () => {
    expect(parse(['breakfast', 'lunch', 'dinner'])).toEqual({
      breakfast: 'included', lunch: 'external', dinner: 'external',
    })
  })

  it('a meal that is not listed is still not charged', () => {
    expect(parse(['breakfast'])).toEqual({ breakfast: 'included', lunch: 'none', dinner: 'none' })
  })

  it('the object format is untouched', () => {
    expect(parse({ breakfast: 'included', lunch: 'external', dinner: 'none' })).toEqual({
      breakfast: 'included', lunch: 'external', dinner: 'none',
    })
  })
})

// ============================================================================
// 3. "Disembark" contains "embark", so the day travellers left the ship was
//    billed as a night aboard.
// ============================================================================
describe('the day they leave the ship', () => {
  const nightOf = (title: string, description = '', allDays: unknown[] = []) =>
    parseItinerary([...(allDays as never[]), { day: 9, title, description, city: 'Aswan' }])
      .slice(-1)[0].accommodation_type

  it('is not a cruise night', () => {
    expect(nightOf('Disembark in Aswan, transfer to your hotel')).toBe('hotel')
    expect(nightOf('Disembarkation')).toBe('hotel')
    // "End of ..." has always meant the trip ends here — no bed either way.
    // What matters is that it is no longer sold as a night aboard.
    expect(nightOf('End of cruise')).not.toBe('cruise')
  })

  it('a real embarkation day still is one', () => {
    expect(nightOf('Embark your Nile cruise')).toBe('cruise')
    expect(nightOf('Sailing to Edfu')).toBe('cruise')
    expect(nightOf('Overnight aboard')).toBe('cruise')
  })

  it('is not dragged back aboard by the rest of the programme', () => {
    const cruiseProgramme = [{ day: 1, title: 'Embark your Nile cruise', city: 'Luxor' }]
    expect(nightOf('Disembark in Aswan, hotel transfer', '', cruiseProgramme)).toBe('hotel')
  })

  it('an explicit accommodation_type always wins over the words', () => {
    expect(parseItinerary([{ day: 1, title: 'Disembark', accommodation_type: 'cruise', city: 'Aswan' }])[0].accommodation_type).toBe('cruise')
  })
})
