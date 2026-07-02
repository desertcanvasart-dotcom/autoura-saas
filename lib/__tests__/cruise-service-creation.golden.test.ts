import { describe, it, expect } from 'vitest'
import { makeWriteMockSupabase } from './_write-mock-supabase'
import { createCruiseItineraryServices } from '../ai/cruise-service-creation'

// CHARACTERIZATION TEST — locks the CURRENT behavior of the cruise
// service-creation (the itinerary_days + itinerary_services rows it writes and
// the totals it returns), so a future change that shifts pricing/rows fails
// here. Snapshots capture "what it does now", not "what's ideal".
//
// `date` is intentionally excluded from snapshots (it's derived via local-TZ
// Date math and would be machine-dependent).

const withMargin = (c: number) => Math.round(c * 1.25 * 100) / 100 // 25% margin

const ENTRANCE_FEES = [
  { attraction_name: 'Karnak Temple', eur_rate: 10, non_eur_rate: 7, is_active: true },
  { attraction_name: 'Luxor Temple', eur_rate: 8, non_eur_rate: 5, is_active: true },
  { attraction_name: 'Edfu Temple', eur_rate: 6, non_eur_rate: 4, is_active: true },
  { attraction_name: 'Philae Temple', eur_rate: 9, non_eur_rate: 6, is_active: true },
]

const DAY_BY_DAY = [
  { day_number: 1, title: 'Embark Luxor', description: 'Board the ship', city: 'Luxor', overnight: 'On board', attractions: ['Karnak Temple', 'Luxor Temple'], meals: ['lunch', 'dinner'] },
  { day_number: 2, title: 'Edfu & Kom Ombo', description: 'Temples', city: 'Edfu', attractions: ['Edfu Temple'], meals: ['lunch', 'dinner'] },
  { day_number: 3, title: 'Sailing Day', description: 'Relax', city: 'Aswan', attractions: [], meals: ['lunch', 'dinner'], is_sailing_day: true },
  { day_number: 4, title: 'Disembark Aswan', description: 'Final day', city: 'Aswan', attractions: ['Philae Temple'], meals: ['lunch'] },
]

const CRUISE_RATE = { perPersonPerNight: 100, shipName: 'MS Nile Star', supplierId: 'cruise-1', cabinType: 'double' }

function baseParams(over: Partial<Parameters<typeof createCruiseItineraryServices>[1]> = {}) {
  return {
    dayByDay: DAY_BY_DAY,
    itineraryId: 'itin-1',
    startDateObj: new Date('2026-11-01T00:00:00Z'),
    durationDays: 4,
    effectiveCity: 'Luxor',
    cruiseRate: CRUISE_RATE,
    totalPax: 2,
    isEuroPassport: true,
    skipPricing: false,
    withMargin,
    ...over,
  }
}

const projectDays = (store: any) =>
  store.itinerary_days.map((d: any) => ({
    day_number: d.day_number, accommodation_type: d.accommodation_type,
    is_cruise_day: d.is_cruise_day, is_sailing_day: d.is_sailing_day,
    attractions: d.attractions, lunch_included: d.lunch_included, dinner_included: d.dinner_included,
  }))

const projectServices = (store: any) =>
  (store.itinerary_services ?? []).map((s: any) => ({
    service_type: s.service_type, service_code: s.service_code,
    quantity: s.quantity, total_cost: s.total_cost, client_price: s.client_price,
  }))

describe('createCruiseItineraryServices — characterization', () => {
  it('full pricing (EUR): days + cruise nights + entrance fees', async () => {
    const sb = makeWriteMockSupabase({ entrance_fees: ENTRANCE_FEES })
    const totals = await createCruiseItineraryServices(sb as any, baseParams())

    // Invariants (derivation-free)
    expect(sb.store.itinerary_days).toHaveLength(4)
    expect(sb.store.itinerary_days[3].accommodation_type).toBe('none') // last day disembark
    expect(sb.store.itinerary_days.slice(0, 3).every((d: any) => d.accommodation_type === 'cruise')).toBe(true)
    for (const s of sb.store.itinerary_services) {
      expect(s.client_price).toBe(withMargin(s.total_cost))
      expect(Number.isNaN(s.total_cost)).toBe(false)
    }
    const sumCost = sb.store.itinerary_services.reduce((a: number, s: any) => a + s.total_cost, 0)
    const sumClient = sb.store.itinerary_services.reduce((a: number, s: any) => a + s.client_price, 0)
    expect(totals.totalSupplierCost).toBe(sumCost)
    expect(totals.totalClientPrice).toBe(sumClient)
    expect(totals.totalClientPrice).toBeGreaterThan(totals.totalSupplierCost)

    // Golden snapshots
    expect(projectDays(sb.store)).toMatchInlineSnapshot(`
      [
        {
          "accommodation_type": "cruise",
          "attractions": [
            "Karnak Temple",
            "Luxor Temple",
          ],
          "day_number": 1,
          "dinner_included": true,
          "is_cruise_day": true,
          "is_sailing_day": false,
          "lunch_included": true,
        },
        {
          "accommodation_type": "cruise",
          "attractions": [
            "Edfu Temple",
          ],
          "day_number": 2,
          "dinner_included": true,
          "is_cruise_day": true,
          "is_sailing_day": false,
          "lunch_included": true,
        },
        {
          "accommodation_type": "cruise",
          "attractions": [],
          "day_number": 3,
          "dinner_included": true,
          "is_cruise_day": true,
          "is_sailing_day": true,
          "lunch_included": true,
        },
        {
          "accommodation_type": "none",
          "attractions": [
            "Philae Temple",
          ],
          "day_number": 4,
          "dinner_included": false,
          "is_cruise_day": true,
          "is_sailing_day": false,
          "lunch_included": true,
        },
      ]
    `)
    expect(projectServices(sb.store)).toMatchInlineSnapshot(`
      [
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 45,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 36,
        },
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 15,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 12,
        },
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 22.5,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 18,
        },
      ]
    `)
    expect(totals).toMatchInlineSnapshot(`
      {
        "totalClientPrice": 832.5,
        "totalSupplierCost": 666,
      }
    `)
  })

  it('skipPricing: days only, no services, zero totals', async () => {
    const sb = makeWriteMockSupabase({ entrance_fees: ENTRANCE_FEES })
    const totals = await createCruiseItineraryServices(sb as any, baseParams({ skipPricing: true }))
    expect(sb.store.itinerary_days).toHaveLength(4)
    expect(sb.store.itinerary_services ?? []).toHaveLength(0)
    expect(totals).toEqual({ totalSupplierCost: 0, totalClientPrice: 0 })
  })

  it('non-EUR passport: entrance uses non_eur_rate', async () => {
    const sb = makeWriteMockSupabase({ entrance_fees: ENTRANCE_FEES })
    const totals = await createCruiseItineraryServices(sb as any, baseParams({ isEuroPassport: false }))
    for (const s of sb.store.itinerary_services) {
      expect(s.client_price).toBe(withMargin(s.total_cost))
    }
    expect(projectServices(sb.store)).toMatchInlineSnapshot(`
      [
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 30,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 24,
        },
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 10,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 8,
        },
        {
          "client_price": 250,
          "quantity": 2,
          "service_code": "cruise-1",
          "service_type": "cruise",
          "total_cost": 200,
        },
        {
          "client_price": 15,
          "quantity": 2,
          "service_code": "ENTRANCE-FEES",
          "service_type": "entrance",
          "total_cost": 12,
        },
      ]
    `)
    expect(totals).toMatchInlineSnapshot(`
      {
        "totalClientPrice": 805,
        "totalSupplierCost": 644,
      }
    `)
  })
})
