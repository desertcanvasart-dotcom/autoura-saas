// The AI itinerary generator tips by the SAME rules as the tour engine
// (lib/pricing/tipping.ts). It used to add one number — the sum of the Per
// Day rows, × 0.8–1.5 by tier, rounded — to every guided day, and REFUSED to
// price an itinerary for an agency with no tipping rows.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { makeWriteMockSupabase } from './_write-mock-supabase'
import { createLandItineraryServices, tipOccasionsForGeneratedDay } from '../ai/service-creation'

const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100
const DAYS = [
  { day_number: 1, title: 'Arrival Cairo', city: 'Cairo', is_arrival: true, needs_airport_service: true, needs_hotel_service: true, attractions: [], guide_required: false, includes_lunch: false, includes_dinner: true, includes_hotel: true },
  { day_number: 2, title: 'Pyramids & Museum', city: 'Cairo', attractions: [], guide_required: true, includes_lunch: true, includes_dinner: true, includes_hotel: true },
  { day_number: 3, title: 'Departure', city: 'Cairo', is_departure: true, is_transfer_only: true },
]
const params = (tippingRows: unknown[], over: Record<string, unknown> = {}) => ({
  tenantId: 'test-tenant', days: DAYS, itineraryId: 'itin-1', startDateObj: new Date('2026-11-01T00:00:00Z'), durationDays: 3,
  effectiveCity: 'Cairo', totalPax: 4, isEuroPassport: true, skipPricing: false, withMargin, tier: 'luxury' as const,
  finalLanguage: 'English', includeLunch: true, includeDinner: false, includeAccommodationFinal: true,
  vehiclePerDay: 80, guidePerDay: 60, selectedVehicle: { id: 'v' }, selectedGuide: { id: 'g' }, selectedHotel: { id: 'h' },
  hotelRate: 120, hotelName_final: 'Nile Ritz', roomsNeeded: 2, airportServiceRates: { arrival: 30, departure: 30 },
  hotelServiceRate: 15, lunchRate: 18, dinnerRate: 25, allEntranceFees: [], tippingRows, ...over,
}) as never

const run = async (tippingRows: unknown[], over: Record<string, unknown> = {}) => {
  const sb = makeWriteMockSupabase()
  const totals = await createLandItineraryServices(sb as never, params(tippingRows, over))
  const dayOf = new Map((sb.store.itinerary_days as any[]).map(d => [d.id, d.day_number]))
  const tips = ((sb.store.itinerary_services ?? []) as any[]).filter(s => s.service_type === 'tips')
    .map(s => ({ day: dayOf.get(s.itinerary_day_id), name: s.service_name, quantity: s.quantity, rate: s.rate_eur, total: s.total_cost }))
  return { totals, tips }
}

describe('the AI generator tips by the shared rules', () => {
  it('Per Service restaurant tip: once for every restaurant meal it creates', async () => {
    const { tips } = await run([{ role_type: 'restaurant', context: 'restaurant', rate_unit: 'per_service', rate_eur: 150 }])
    expect(tips).toEqual([
      { day: 1, name: 'Restaurant tip — Restaurant', quantity: 1, rate: 150, total: 150 }, // dinner
      { day: 2, name: 'Restaurant tip — Restaurant', quantity: 2, rate: 150, total: 300 }, // lunch + dinner
    ])
  })

  it('Per Day driver tip: the guided day only — and the amount typed, on the LUXURY tier (it used to be × 1.5)', async () => {
    const { tips } = await run([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 500 }])
    expect(tips).toEqual([{ day: 2, name: 'Driver tip — Day Tour', quantity: 1, rate: 500, total: 500 }])
  })

  it('Per Person: × the travellers, once per day its context applies', async () => {
    const { tips } = await run([{ role_type: 'guide', context: 'day_tour', rate_unit: 'per_person', rate_eur: 5 }])
    expect(tips).toEqual([{ day: 2, name: 'Guide tip — Day Tour', quantity: 4, rate: 5, total: 20 }])
  })

  it('Per Night hotel tip: the two hotel nights, not the departure day', async () => {
    const { tips } = await run([{ role_type: 'hotel_staff', context: 'hotel', rate_unit: 'per_night', rate_eur: 10 }])
    expect(tips.map(t => t.day)).toEqual([1, 2])
  })

  it('the departure transfer-only day still gets its transfer tip (its loop exits early)', async () => {
    const { tips } = await run([{ role_type: 'driver', context: 'transfer', rate_unit: 'per_service', rate_eur: 40 }])
    expect(tips).toEqual([{ day: 3, name: 'Driver tip — Transfer', quantity: 1, rate: 40, total: 40 }])
  })

  it('an airport tip lands on the arrival day', async () => {
    const { tips } = await run([{ role_type: 'porter', context: 'airport', rate_unit: 'per_service', rate_eur: 20 }])
    expect(tips.map(t => t.day)).toEqual([1])
  })

  it('tips are in the totals — cost, and price with the margin', async () => {
    const bare = await run([])
    const tipped = await run([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 500 }])
    expect(tipped.totals.totalSupplierCost - bare.totals.totalSupplierCost).toBe(500)
    expect(tipped.totals.totalClientPrice - bare.totals.totalClientPrice).toBe(625)
  })

  it('never a gap: no tipping rows = no tip lines, and the itinerary is still priced', async () => {
    const { tips, totals } = await run([])
    expect(tips).toEqual([])
    expect(totals.totalSupplierCost).toBeGreaterThan(0)
  })

  it('a row pricing cannot count (Felucca) is charged nowhere', async () => {
    expect((await run([{ role_type: 'boat_crew', context: 'felucca', rate_unit: 'per_service', rate_eur: 99 }])).tips).toEqual([])
  })

  it('skip_pricing writes no tips', async () => {
    expect((await run([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 500 }], { skipPricing: true })).tips).toEqual([])
  })
})

describe('a generated day’s occasions mirror what the loop creates', () => {
  const p = { durationDays: 3, effectiveCity: 'Cairo', includeLunch: true, includeDinner: false, includeAccommodationFinal: true }
  it('free and sailing days: no sightseeing, no lunch', () => {
    const d = tipOccasionsForGeneratedDay({ day_number: 2, is_sailing_day: true, is_cruise_day: true }, p)
    expect(d).toMatchObject({ sightseeing: null, restaurantMeals: 0, night: 'cruise' })
  })
  it('the last day has no night', () => {
    expect(tipOccasionsForGeneratedDay({ day_number: 3, is_cruise_day: true }, p).night).toBeNull()
    expect(tipOccasionsForGeneratedDay({ day_number: 3 }, p).night).toBeNull()
  })
  it('a departure transfer-only day is a transfer and nothing else', () => {
    expect(tipOccasionsForGeneratedDay({ day_number: 3, is_departure: true, is_transfer_only: true, includes_dinner: true }, p))
      .toMatchObject({ transfers: 1, airportServices: 0, restaurantMeals: 0, sightseeing: null, night: null })
  })
})

describe('the route', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/ai/generate-itinerary/route.ts'), 'utf8')
  it('no tier multiplier, no per-day-only sum, no refusal for an empty tipping sheet', () => {
    expect(route).not.toMatch(/tierMultiplier/)
    expect(route).not.toMatch(/dailyTips/)
    expect(route).not.toContain('No active tipping rates are set up')
    expect(route).not.toMatch(/kind: 'tipping'/)
  })
  it('hands the rows to the service creator, named columns only', () => {
    expect(route).toContain('tippingRows, allEntranceFees,')
    expect(route).toContain(".select('id, tenant_id, role_type, context, rate_unit, rate_eur, rate_currency, city')")
  })
})
