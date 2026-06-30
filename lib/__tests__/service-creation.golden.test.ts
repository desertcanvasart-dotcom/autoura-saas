import { describe, it, expect } from 'vitest'
import { makeWriteMockSupabase } from './_write-mock-supabase'
import { createLandItineraryServices } from '../ai/service-creation'

// CHARACTERIZATION TEST — locks the CURRENT behavior of the land
// service-creation (itinerary_days + itinerary_services rows + returned
// totals). Pure-land itinerary (no cruise days) so no DB reads are needed —
// all rates are params. `date` excluded from snapshots (local-TZ derived).

const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100 // 25% margin

const ALL_ENTRANCE_FEES = [
  { attraction_name: 'Pyramids of Giza', eur_rate: 20, non_eur_rate: 14, is_active: true, is_addon: false },
  { attraction_name: 'Egyptian Museum', eur_rate: 15, non_eur_rate: 11, is_active: true, is_addon: false },
]

const DAYS = [
  { day_number: 1, title: 'Arrival Cairo', description: 'Welcome', city: 'Cairo', is_arrival: true, needs_airport_service: true, needs_hotel_service: true, attractions: [], guide_required: false, includes_lunch: false, includes_dinner: true, includes_hotel: true },
  { day_number: 2, title: 'Pyramids & Museum', description: 'Giza day', city: 'Cairo', attractions: ['Pyramids of Giza', 'Egyptian Museum'], entrance_included: ['Pyramids of Giza', 'Egyptian Museum'], guide_required: true, includes_lunch: true, includes_dinner: false, includes_hotel: true },
  { day_number: 3, title: 'Departure', description: 'Fly home', city: 'Cairo', is_departure: true, is_transfer_only: true },
]

function baseParams(over: Partial<Parameters<typeof createLandItineraryServices>[1]> = {}) {
  return {
    days: DAYS,
    itineraryId: 'itin-1',
    startDateObj: new Date('2026-11-01T00:00:00Z'),
    durationDays: 3,
    effectiveCity: 'Cairo',
    totalPax: 2,
    isEuroPassport: true,
    skipPricing: false,
    withMargin,
    tier: 'standard' as const,
    finalLanguage: 'English',
    includeLunch: true,
    includeDinner: false,
    includeAccommodationFinal: true,
    vehiclePerDay: 80,
    guidePerDay: 60,
    selectedVehicle: { id: 'veh-1', vehicle_type: 'Minivan', company_name: 'Cairo Cars' },
    selectedGuide: { id: 'guide-1', name: 'Ahmed' },
    selectedHotel: { id: 'hotel-1' },
    hotelRate: 120,
    hotelName_final: 'Nile Ritz',
    roomsNeeded: 1,
    airportServiceRate: 30,
    hotelServiceRate: 15,
    lunchRate: 18,
    dinnerRate: 25,
    dailyTips: 12,
    allEntranceFees: ALL_ENTRANCE_FEES,
    ...over,
  }
}

const projectDays = (store: any) =>
  store.itinerary_days.map((d: any) => ({
    day_number: d.day_number, accommodation_type: d.accommodation_type,
    guide_required: d.guide_required, lunch_included: d.lunch_included,
    dinner_included: d.dinner_included, hotel_included: d.hotel_included,
  }))

const projectServices = (store: any) =>
  (store.itinerary_services ?? []).map((s: any) => ({
    day: s.itinerary_day_id, service_type: s.service_type, service_code: s.service_code,
    quantity: s.quantity, total_cost: s.total_cost, client_price: s.client_price,
  }))

describe('createLandItineraryServices — characterization', () => {
  it('full pricing (EUR): full service set across arrival/touring/departure', async () => {
    const sb = makeWriteMockSupabase()
    const totals = await createLandItineraryServices(sb as any, baseParams())

    expect(sb.store.itinerary_days).toHaveLength(3)
    for (const s of sb.store.itinerary_services) {
      expect(s.client_price).toBe(withMargin(s.total_cost))
      expect(Number.isNaN(s.total_cost)).toBe(false)
    }
    const sumCost = sb.store.itinerary_services.reduce((a: number, s: any) => a + s.total_cost, 0)
    const sumClient = sb.store.itinerary_services.reduce((a: number, s: any) => a + s.client_price, 0)
    expect(totals.totalSupplierCost).toBe(sumCost)
    expect(totals.totalClientPrice).toBe(sumClient)

    expect(projectDays(sb.store)).toMatchInlineSnapshot(`
      [
        {
          "accommodation_type": "hotel",
          "day_number": 1,
          "dinner_included": true,
          "guide_required": false,
          "hotel_included": true,
          "lunch_included": false,
        },
        {
          "accommodation_type": "hotel",
          "day_number": 2,
          "dinner_included": false,
          "guide_required": true,
          "hotel_included": true,
          "lunch_included": true,
        },
        {
          "accommodation_type": "none",
          "day_number": 3,
          "dinner_included": false,
          "guide_required": false,
          "hotel_included": false,
          "lunch_included": true,
        },
      ]
    `)
    expect(projectServices(sb.store)).toMatchInlineSnapshot(`
      [
        {
          "client_price": 37.5,
          "day": "itinerary_days-1",
          "quantity": 1,
          "service_code": "AIRPORT",
          "service_type": "airport_service",
          "total_cost": 30,
        },
        {
          "client_price": 18.75,
          "day": "itinerary_days-1",
          "quantity": 1,
          "service_code": "HOTEL-SVC",
          "service_type": "hotel_service",
          "total_cost": 15,
        },
        {
          "client_price": 100,
          "day": "itinerary_days-1",
          "quantity": 1,
          "service_code": "veh-1",
          "service_type": "transportation",
          "total_cost": 80,
        },
        {
          "client_price": 62.5,
          "day": "itinerary_days-1",
          "quantity": 2,
          "service_code": "DINNER",
          "service_type": "meal",
          "total_cost": 50,
        },
        {
          "client_price": 5,
          "day": "itinerary_days-1",
          "quantity": 2,
          "service_code": "WATER",
          "service_type": "supplies",
          "total_cost": 4,
        },
        {
          "client_price": 150,
          "day": "itinerary_days-1",
          "quantity": 1,
          "service_code": "hotel-1",
          "service_type": "accommodation",
          "total_cost": 120,
        },
        {
          "client_price": 100,
          "day": "itinerary_days-8",
          "quantity": 1,
          "service_code": "veh-1",
          "service_type": "transportation",
          "total_cost": 80,
        },
        {
          "client_price": 75,
          "day": "itinerary_days-8",
          "quantity": 1,
          "service_code": "guide-1",
          "service_type": "guide",
          "total_cost": 60,
        },
        {
          "client_price": 15,
          "day": "itinerary_days-8",
          "quantity": 1,
          "service_code": "TIPS",
          "service_type": "tips",
          "total_cost": 12,
        },
        {
          "client_price": 87.5,
          "day": "itinerary_days-8",
          "quantity": 2,
          "service_code": "ENTRANCE",
          "service_type": "entrance",
          "total_cost": 70,
        },
        {
          "client_price": 45,
          "day": "itinerary_days-8",
          "quantity": 2,
          "service_code": "LUNCH",
          "service_type": "meal",
          "total_cost": 36,
        },
        {
          "client_price": 5,
          "day": "itinerary_days-8",
          "quantity": 2,
          "service_code": "WATER",
          "service_type": "supplies",
          "total_cost": 4,
        },
        {
          "client_price": 150,
          "day": "itinerary_days-8",
          "quantity": 1,
          "service_code": "hotel-1",
          "service_type": "accommodation",
          "total_cost": 120,
        },
        {
          "client_price": 50,
          "day": "itinerary_days-16",
          "quantity": 1,
          "service_code": "TRANSFER",
          "service_type": "transportation",
          "total_cost": 40,
        },
      ]
    `)
    expect(totals).toMatchInlineSnapshot(`
      {
        "totalClientPrice": 901.25,
        "totalSupplierCost": 721,
      }
    `)
  })

  it('skipPricing: days only, no services, zero totals', async () => {
    const sb = makeWriteMockSupabase()
    const totals = await createLandItineraryServices(sb as any, baseParams({ skipPricing: true }))
    expect(sb.store.itinerary_days).toHaveLength(3)
    expect(sb.store.itinerary_services ?? []).toHaveLength(0)
    expect(totals).toEqual({ totalSupplierCost: 0, totalClientPrice: 0 })
  })

  it('non-EUR passport: entrance uses non_eur_rate', async () => {
    const sb = makeWriteMockSupabase()
    const totals = await createLandItineraryServices(sb as any, baseParams({ isEuroPassport: false }))
    const entrance = sb.store.itinerary_services.filter((s: any) => s.service_type === 'entrance')
    expect(entrance.length).toBeGreaterThan(0)
    expect(totals).toMatchInlineSnapshot(`
      {
        "totalClientPrice": 876.25,
        "totalSupplierCost": 701,
      }
    `)
  })
})
