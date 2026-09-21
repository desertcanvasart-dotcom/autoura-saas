// The AI itinerary generator prices its GUIDE from Rates → Guides and its
// HOTELS from Rates → Hotels — the tour engine's own lookups.
//
// They came from a guide ROSTER (`guides.daily_rate`) and a hotel CONTACTS list
// (`hotel_contacts.rate_double_eur`). On production (2026-09-22) no agency has
// a row in either, so both lookups withheld every price. And the hotel was ONE
// hotel for the whole trip, looked up in the itinerary's FIRST city — a Luxor
// night was priced at the Cairo hotel — as rooms at a flat double rate.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { makeWriteMockSupabase } from './_write-mock-supabase'
import { createLandItineraryServices, hotelNightsForGeneratedDays, guidedDaysOfGeneratedItinerary } from '../ai/service-creation'

const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100
const DAYS = [
  { day_number: 1, title: 'Arrival', city: 'Cairo', is_arrival: true, is_transfer_only: true, guide_required: false, includes_lunch: false, includes_dinner: false },
  { day_number: 2, title: 'Cairo', city: 'Cairo', guide_required: true, attractions: [], includes_lunch: false, includes_dinner: false },
  { day_number: 3, title: 'Luxor', city: 'Luxor', guide_required: true, attractions: [], includes_lunch: false, includes_dinner: false },
  { day_number: 4, title: 'Departure', city: 'Luxor', is_departure: true, is_transfer_only: true },
]
type Row = Record<string, unknown>
type Night = { ppd: number; singleSupplement: number; hotelName: string; rateId: string }
const run = async (hotelByDay: Record<number, Night>, over: Row = {}) => {
  const sb = makeWriteMockSupabase()
  const totals = await createLandItineraryServices(sb as never, {
    tenantId: 'test-tenant', days: DAYS, itineraryId: 'itin-1', startDateObj: new Date('2026-11-01T00:00:00Z'), durationDays: 4,
    effectiveCity: 'Cairo', totalPax: 2, isEuroPassport: true, skipPricing: false, withMargin, tier: 'standard',
    finalLanguage: 'English', includeLunch: false, includeDinner: false, includeAccommodationFinal: true,
    guidePerDay: 45, selectedGuide: { id: 'gr-1', name: 'English — full day' },
    airportServiceRates: { arrival: 30, departure: 30 }, hotelServiceRate: 15, lunchRate: 0, dinnerRate: 0,
    allEntranceFees: [], tippingRows: [], transportByDay: {}, hotelByDay, ...over,
  } as never)
  const dayOf = new Map((sb.store.itinerary_days as Row[]).map(d => [d.id, d.day_number]))
  const lines = (type: string) => ((sb.store.itinerary_services ?? []) as Row[]).filter(s => s.service_type === type)
    .map(s => ({ day: dayOf.get(s.itinerary_day_id), name: s.service_name, code: s.service_code, quantity: s.quantity, rate: s.rate_eur, cost: s.total_cost }))
  return { totals, hotels: lines('accommodation'), guides: lines('guide') }
}
const CAIRO: Night = { ppd: 40, singleSupplement: 22, hotelName: 'Cairo Grand', rateId: 'ar-cai' }
const LUXOR: Night = { ppd: 55, singleSupplement: 30, hotelName: 'Luxor Palace', rateId: 'ar-lux' }

describe('hotels: each night its own hotel, in its own city', () => {
  it('a Cairo night is the Cairo hotel and a Luxor night the Luxor hotel — per person in a double', async () => {
    const { hotels } = await run({ 1: CAIRO, 2: CAIRO, 3: LUXOR })
    expect(hotels).toEqual([
      { day: 1, name: 'Cairo Grand', code: 'ar-cai', quantity: 2, rate: 40, cost: 80 },
      { day: 2, name: 'Cairo Grand', code: 'ar-cai', quantity: 2, rate: 40, cost: 80 },
      { day: 3, name: 'Luxor Palace', code: 'ar-lux', quantity: 2, rate: 55, cost: 110 },
    ])
  })

  it('an odd traveller has a room alone: per person × 3, plus ONE single supplement', async () => {
    const { hotels } = await run({ 3: LUXOR }, { totalPax: 3 })
    expect(hotels).toEqual([{ day: 3, name: 'Luxor Palace', code: 'ar-lux', quantity: 3, rate: 55, cost: 55 * 3 + 30 }])
  })

  it('the last day has no night, whatever it is handed', async () => {
    expect((await run({ 4: LUXOR })).hotels).toEqual([])
  })

  it('a night with no rate gets NO line — never a made-up one', async () => {
    expect((await run({})).hotels).toEqual([])
  })

  it('accommodation not included: no hotel lines even when rates are handed in', async () => {
    expect((await run({ 1: CAIRO, 2: CAIRO }, { includeAccommodationFinal: false })).hotels).toEqual([])
  })

  it('the hotel is in the totals — cost, and price with the margin', async () => {
    const bare = await run({})
    const slept = await run({ 3: LUXOR })
    expect(slept.totals.totalSupplierCost - bare.totals.totalSupplierCost).toBe(110)
    expect(slept.totals.totalClientPrice - bare.totals.totalClientPrice).toBe(137.5)
  })
})

describe('which nights, and where', () => {
  const p = { durationDays: 4, effectiveCity: 'Cairo', includeAccommodationFinal: true }
  it('every night but the last, in the night’s own city', () => {
    expect(hotelNightsForGeneratedDays(DAYS, p)).toEqual([{ day: 1, city: 'Cairo' }, { day: 2, city: 'Cairo' }, { day: 3, city: 'Luxor' }])
  })
  it('where the night is SLEPT wins over where the day was spent', () => {
    expect(hotelNightsForGeneratedDays([{ day_number: 1, city: 'Aswan', overnight_city: 'Abu Simbel' }], { ...p, durationDays: 2 })).toEqual([{ day: 1, city: 'Abu Simbel' }])
  })
  it('not aboard a cruise, not when the day says no hotel, not when the package has none', () => {
    expect(hotelNightsForGeneratedDays([{ day_number: 1, city: 'Luxor', is_cruise_day: true }, { day_number: 2, city: 'Luxor', includes_hotel: false }], p)).toEqual([])
    expect(hotelNightsForGeneratedDays(DAYS, { ...p, includeAccommodationFinal: false })).toEqual([])
  })
  it('a night with no city at all is still a night — the route reports it, rather than dropping it', () => {
    expect(hotelNightsForGeneratedDays([{ day_number: 1 }], { ...p, effectiveCity: '' })).toEqual([{ day: 1, city: '' }])
  })
})

describe('the guide', () => {
  it('is charged on the guided days only, at the rate handed in, under the rate’s id', async () => {
    const { guides } = await run({})
    expect(guides).toEqual([
      { day: 2, name: 'English Speaking Guide', code: 'gr-1', quantity: 1, rate: 45, cost: 45 },
      { day: 3, name: 'English Speaking Guide', code: 'gr-1', quantity: 1, rate: 45, cost: 45 },
    ])
  })
  it('which days are guided: not transfer-only, not free, not sailing, not when the day says no', () => {
    expect(guidedDaysOfGeneratedItinerary(DAYS)).toEqual([2, 3])
    expect(guidedDaysOfGeneratedItinerary([{ day_number: 1, is_free_day: true }, { day_number: 2, is_sailing_day: true }, { day_number: 3, guide_required: false }])).toEqual([])
  })
})

describe('the route', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/ai/generate-itinerary/route.ts'), 'utf8')
  const code = route.replace(/\/\/.*$/gm, '')
  it('reads neither the guide roster nor the hotel contacts', () => {
    expect(code).not.toMatch(/from\('guides'\)/)
    expect(code).not.toMatch(/from\('hotel_contacts'\)/)
    expect(code).not.toMatch(/rate_double_eur|roomsNeeded/)
  })
  it('asks the engine — and accepts only an exact rate', () => {
    expect(code).toMatch(/getGuideRate\(\{ tenantId: tenant_id \}, finalLanguage, tier\)/)
    expect(code).toMatch(/found\.source === 'db' && found\.dailyRate > 0/)
    expect(code).toMatch(/getHotelRates\(\{ tenantId: tenant_id \}, night\.city, tier, /)
    expect(code).toMatch(/rates\.source === 'db' && rates\.ppdNight > 0/)
  })
  it('only looks for a guide when some day is guided', () => {
    expect(code).toMatch(/if \(guidedDaysOfGeneratedItinerary\(itineraryData\?\.days\)\.length > 0\)/)
  })
  it('does it after the days exist and before the record is created; a miss withholds the price', () => {
    const at = (needle: string) => route.indexOf(needle)
    expect(at('applyDayRules(itineraryData.days')).toBeLessThan(at('hotelNightsForGeneratedDays(itineraryData?.days'))
    expect(at('hotelNightsForGeneratedDays(itineraryData?.days')).toBeLessThan(route.lastIndexOf('await createItineraryRecord(supabase'))
    expect(at('hotelNightsForGeneratedDays(itineraryData?.days')).toBeLessThan(route.lastIndexOf('pricingBlocked = holes.length > 0'))
  })
})
