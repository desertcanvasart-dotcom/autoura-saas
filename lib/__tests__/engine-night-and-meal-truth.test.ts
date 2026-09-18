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
    // The night is LISTED in its day at 0 and marked unpriced (the gap is
    // where the operator reads the day), never priced.
    const nights = result.services.filter(s => s.serviceType === 'accommodation')
    expect(nights.length).toBeGreaterThan(0)
    for (const night of nights) {
      expect(night.unpriced).toBe(true)
      expect(night.lineTotal).toBe(0)
      expect(night.issue).toContain('Winter')
    }
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
  /** The night of a day INSIDE a programme. A one-day itinerary is a day
   *  tour, which has no night — so a trailing day keeps this about the words. */
  const nightOf = (title: string, description = '', allDays: unknown[] = []) =>
    parseItinerary([
      ...(allDays as never[]),
      { day: 9, title, description, city: 'Aswan' },
      { day: 10, title: 'Onward', city: 'Aswan' },
    ])[(allDays as never[]).length].accommodation_type

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
    expect(
      parseItinerary([
        { day: 1, title: 'Disembark', accommodation_type: 'cruise', city: 'Aswan' },
        { day: 2, title: 'Onward', city: 'Aswan' },
      ])[0].accommodation_type
    ).toBe('cruise')
  })
})

// ============================================================================
// 4. One day saying "cruise" used to make the WHOLE programme cruise nights.
//    Checked against the shape of the live "Egypt End to End" tour: 12 days,
//    none of them stating a night type, one of them boarding a ship.
// ============================================================================
describe('a programme with a cruise in the middle of it', () => {
  // Titles and the traps in the real descriptions, from the live template.
  const EGYPT_END_TO_END = [
    { day: 1, title: 'Arrival in Cairo' },
    { day: 2, title: 'Memphis, Saqqara & Old Cairo' },
    { day: 3, title: 'Egyptian Museum & the Giza Pyramids' },
    { day: 4, title: 'Fly to Aswan & Abu Simbel', description: 'Early-morning flight to Aswan, travel south to Abu Simbel, then return to Aswan for a felucca sail.' },
    { day: 5, title: 'Aswan Sightseeing & Board the Cruise' },
    { day: 6, title: 'Sail to Kom Ombo' },
    { day: 7, title: 'Edfu Temple & Sail to Luxor' },
    { day: 8, title: "Luxor's West & East Banks", description: 'Disembark after breakfast.' },
    { day: 9, title: 'Leisure in Hurghada' },
    { day: 10, title: 'Leisure in Hurghada' },
    { day: 11, title: 'Fly to Cairo & Khan El Khalili' },
    { day: 12, title: 'Departure', description: 'After breakfast, transfer to Cairo International Airport for departure flight. Source states hand-picked hotels and cruise boats across three comfort tiers.' },
  ]

  const nights = () => parseItinerary(EGYPT_END_TO_END).map(d => d.accommodation_type)

  it('sells only the nights that are actually aboard', () => {
    expect(nights()).toEqual([
      'hotel', 'hotel', 'hotel', 'hotel',   // Cairo, Cairo, Cairo, Aswan
      'cruise', 'cruise', 'cruise',         // board, sail, sail
      'hotel',                              // disembark, Luxor
      'hotel', 'hotel',                     // Hurghada, on the Red Sea
      'hotel',                              // back in Cairo
      'none',                               // departure
    ])
  })

  it('does not put the beach nights on the ship', () => {
    expect(nights()[8]).toBe('hotel')
    expect(nights()[9]).toBe('hotel')
  })

  it('does not put the nights before boarding on the ship', () => {
    expect(nights().slice(0, 4)).toEqual(['hotel', 'hotel', 'hotel', 'hotel'])
  })

  it('judges a day on its own words, not on the other days', () => {
    const alone = parseItinerary([
      { day: 1, title: 'Leisure in Hurghada' },
      { day: 2, title: 'Onward' },
    ])[0].accommodation_type
    const amongCruiseDays = nights()[8]
    expect(amongCruiseDays).toBe(alone)
  })
})

describe('the two traps in the real descriptions', () => {
  const night = (day: Record<string, unknown>) =>
    parseItinerary([day, { day: 99, title: 'Onward' }])[0].accommodation_type

  it('an afternoon felucca sail is not a night aboard', () => {
    expect(night({ day: 4, title: 'Fly to Aswan & Abu Simbel', description: 'Return to Aswan for a felucca sail.' })).toBe('hotel')
  })

  it('marketing copy naming cruise boats does not put anyone on one', () => {
    expect(night({
      day: 12, title: 'Departure',
      description: 'Transfer to the airport. Source states hand-picked hotels and cruise boats across three comfort tiers.',
    })).toBe('none')
    expect(night({
      day: 2, title: 'Memphis & Saqqara',
      description: 'Our hand-picked hotels and cruise boats across three comfort tiers.',
    })).toBe('hotel')
  })

  it('but a description that really says they sleep aboard is believed', () => {
    expect(night({ day: 6, title: 'Kom Ombo', description: 'Overnight on board.' })).toBe('cruise')
    expect(night({ day: 6, title: 'Kom Ombo', description: 'Overnight aboard the MS Farah.' })).toBe('cruise')
    expect(night({ day: 6, title: 'Edfu', description: 'Dinner and overnight on the ship.' })).toBe('cruise')
  })
})

// ============================================
// 5. A one-day tour has no night
// ============================================
// Found in the live data on 2026-09-18: 12 single-day tours across Sawa Tours
// and Travel2Egypt store no night type, and the words in their titles say
// nothing about sleeping — so every one of them was priced with a HOTEL night
// nobody sleeps.
describe('a one-day tour', () => {
  const oneDay = (title: string) => parseItinerary([{ day: 1, title }])[0]

  it('has no night, whatever its title says', () => {
    for (const title of [
      'Giza Pyramids, Sphinx & the Grand Egyptian Museum',
      'Luxor in Depth — East & West Bank Full Day',
      'Cairo to Alexandria — the Mediterranean Day Tour',
      'Aswan to Abu Simbel — Temples of Ramses II & Nefertari',
    ]) {
      expect(oneDay(title).accommodation_type, title).toBe('none')
    }
  })

  it('still obeys a night it DOES state — a one-day trip can include a cabin', () => {
    expect(parseItinerary([{ day: 1, title: 'Overnight felucca', accommodation_type: 'cruise' }])[0].accommodation_type)
      .toBe('cruise')
  })

  it('does not change a programme of two days or more', () => {
    const days = parseItinerary([{ day: 1, title: 'Arrival in Cairo' }, { day: 2, title: 'Departure' }])
    expect(days[0].accommodation_type).toBe('hotel')
  })
})
