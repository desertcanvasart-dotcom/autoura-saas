// The B2B quote-from-itinerary pricing rules: the grid's cost wins, unpriced
// lines go through the (injected) engine lookups, and anything left is a
// hole — never a 0. Pure: no database.
import { describe, it, expect, vi } from 'vitest'
import { repriceItineraryServices, type QuoteLookups, type ItineraryDayRow } from '@/lib/b2b/quote-from-itinerary-pricing'

const ctx = { tier: 'standard', numPax: 4, isEurPassport: true, currencySymbol: '¤', tourLeaderIncluded: false }

function lookups(over: Partial<QuoteLookups> = {}): QuoteLookups {
  return {
    hotel: vi.fn(async () => ({ hotelName: 'Nile View', ppdNight: 100, singleSuppNight: 30, source: 'db' as const })),
    cruise: vi.fn(async () => ({ shipName: 'MS Ra', ppdNight: 150, singleSuppNight: 50, source: 'db' as const })),
    meals: vi.fn(async () => ({ lunch: 15, dinner: 25, source: 'db' as const })),
    guide: vi.fn(async () => ({ dailyRate: 80, source: 'db' as const })),
    entrance: vi.fn(async () => ({ rate: 12 })),
    tieredActivity: vi.fn(async () => null),
    ...over,
  }
}

const day = (n: number, services: ItineraryDayRow['itinerary_services'], city = 'Cairo'): ItineraryDayRow =>
  ({ day_number: n, city, itinerary_services: services })

describe('rule 1 — a line the grid priced keeps its cost', () => {
  it('never re-chooses a hotel/guide/meal the operator already priced', async () => {
    const L = lookups()
    const r = await repriceItineraryServices([
      day(1, [
        { service_type: 'accommodation', service_name: 'Steigenberger', quantity: 4, unit_cost: 90, total_cost: 360, rate_table: 'accommodation_rates', rate_id: 'h-1' },
        { service_type: 'guide', service_name: 'English guide', quantity: 1, unit_cost: 70, total_cost: 70 },
        { service_type: 'meal', service_name: 'Lunch', quantity: 4, unit_cost: 10, total_cost: 40 },
      ]),
    ], ctx, L)
    expect(r.holes).toEqual([])
    expect(r.services.map(s => [s.rate_source, s.unit_cost, s.line_total])).toEqual([
      ['itinerary', 90, 360], ['itinerary', 70, 70], ['itinerary', 10, 40],
    ])
    expect(r.subtotalCost).toBe(470)
    expect(L.guide).not.toHaveBeenCalled()
    expect(L.meals).not.toHaveBeenCalled()
  })
  it('the single supplement comes from the PINNED hotel row, not a tier re-pick', async () => {
    const L = lookups()
    const r = await repriceItineraryServices([
      day(1, [{ service_type: 'accommodation', service_name: 'Steigenberger', quantity: 4, unit_cost: 90, total_cost: 360, rate_table: 'accommodation_rates', rate_id: 'h-1' }]),
      day(2, [{ service_type: 'accommodation', service_name: 'Steigenberger', quantity: 4, unit_cost: 90, total_cost: 360, rate_table: 'accommodation_rates', rate_id: 'h-1' }]),
    ], ctx, L)
    expect(L.hotel).toHaveBeenCalledTimes(1)
    expect(L.hotel).toHaveBeenCalledWith('Cairo', 'h-1')
    expect(r.singleSupplement).toBe(60)
  })
  it('a pinned row that is gone is a hole for the supplement, and the bed cost is still kept', async () => {
    const L = lookups({ hotel: vi.fn(async () => null) })
    const r = await repriceItineraryServices([
      day(1, [{ service_type: 'accommodation', service_name: 'Old Hotel', quantity: 2, unit_cost: 50, total_cost: 100, rate_table: 'accommodation_rates', rate_id: 'gone' }]),
    ], ctx, L)
    expect(r.services[0].line_total).toBe(100)
    expect(r.holes).toHaveLength(1)
    expect(r.holes[0].message).toMatch(/Single supplement: .*no longer on file/)
  })
})

describe('rule 2 — an unpriced line goes through the engine', () => {
  it('prices an unpriced hotel night per pax from the tier lookup', async () => {
    const r = await repriceItineraryServices([
      day(1, [{ service_type: 'accommodation', service_name: 'Hotel', quantity: 4, unit_cost: null, total_cost: null }]),
    ], ctx, lookups())
    expect(r.services[0]).toMatchObject({ rate_source: 'accommodation_rates', unit_cost: 100, line_total: 400, quantity: 4 })
    expect(r.singleSupplement).toBe(30)
  })
  it('an unpriced cruise night (pinned to nile_cruises) uses the cruise lookup', async () => {
    const L = lookups()
    const r = await repriceItineraryServices([
      day(1, [{ service_type: 'accommodation', service_name: 'MS Ra', quantity: 4, unit_cost: 0, total_cost: 0, rate_table: 'nile_cruises', rate_id: 'c-1' }], 'Luxor'),
    ], ctx, L)
    expect(L.cruise).toHaveBeenCalledWith('Luxor', 'c-1')
    expect(r.services[0]).toMatchObject({ rate_source: 'nile_cruises', line_total: 600 })
    expect(r.singleSupplement).toBe(0)
  })
  it('lunch and dinner are told apart by name', async () => {
    const r = await repriceItineraryServices([
      day(1, [
        { service_type: 'meal', service_name: 'Dinner at Naguib', quantity: 4 },
        { service_type: 'meal', service_name: 'Lunch', quantity: 4 },
      ]),
    ], ctx, lookups())
    expect(r.services.map(s => s.unit_cost)).toEqual([25, 15])
  })
  it('entrance: activity tiers first, then the fee', async () => {
    const L = lookups({
      tieredActivity: vi.fn(async (name: string) => name === 'Felucca' ? { tiers: [{ min_pax: 1, max_pax: 10, rate_eur: 40, rate_non_eur: 40, label: '1-10' }] } : null),
    })
    const r = await repriceItineraryServices([
      day(1, [
        { service_type: 'entrance', service_name: 'Felucca', quantity: 4 },
        { service_type: 'entrance', service_name: 'Pyramids', quantity: 4 },
      ]),
    ], ctx, L)
    expect(r.services[0].rate_source).toBe('activity_tiers')
    expect(r.services[1]).toMatchObject({ rate_source: 'entrance_fees', unit_cost: 12, line_total: 48 })
  })
})

describe('rule 3 — refuse to guess: holes, never 0', () => {
  it('an ambiguous hotel is a hole naming the candidates and the line is NOT priced at 0', async () => {
    const L = lookups({
      hotel: vi.fn(async () => ({ ppdNight: 0, singleSuppNight: 0, source: 'missing' as const, ambiguous: { count: 3, names: ['A', 'B', 'C'], preferredCount: 0 } })),
    })
    const r = await repriceItineraryServices([
      day(1, [{ service_type: 'accommodation', service_name: 'Hotel', quantity: 4 }]),
    ], ctx, L)
    expect(r.services).toEqual([])
    expect(r.subtotalCost).toBe(0)
    expect(r.holes).toHaveLength(1)
    expect(r.holes[0].message).toBe('3 standard hotels in Cairo (A, B, C) and none is marked preferred. Mark exactly one as preferred in Rates → Hotels, or pick one in the pricing grid.')
  })
  it('a fuzzy hotel match (wrong city/tier) is a hole, not a price', async () => {
    const L = lookups({ hotel: vi.fn(async () => ({ hotelName: 'X', ppdNight: 100, singleSuppNight: 0, source: 'fuzzy' as const })) })
    const r = await repriceItineraryServices([day(1, [{ service_type: 'hotel', service_name: 'Hotel', quantity: 2 }])], ctx, L)
    expect(r.services).toEqual([])
    expect(r.holes[0].message).toMatch(/No exact standard hotel rate for Cairo/)
  })
  it('an ambiguous restaurant is a per-meal hole', async () => {
    const L = lookups({ meals: vi.fn(async () => ({ source: 'missing' as const, ambiguous: { dinner: { count: 2, names: ['Naguib', 'Abou El Sid'], preferredCount: 0 } } })) })
    const r = await repriceItineraryServices([day(1, [{ service_type: 'meal', service_name: 'Dinner', quantity: 4 }])], ctx, L)
    expect(r.holes[0].message).toMatch(/2 standard dinner restaurants \(Naguib, Abou El Sid\)/)
  })
  it('a missing tour-leader rate is a hole, never the first active guide', async () => {
    const L = lookups({ guide: vi.fn(async () => null) })
    const r = await repriceItineraryServices([day(1, []), day(2, []), day(3, [])], { ...ctx, tourLeaderIncluded: true }, L)
    expect(r.tourLeaderCost).toBe(0)
    expect(r.holes[0]).toMatchObject({ kind: 'guide', service: 'Tour leader' })
  })
  it('the tour leader is priced at the touring days when the guide rate exists', async () => {
    const r = await repriceItineraryServices([day(1, []), day(2, []), day(3, [])], { ...ctx, tourLeaderIncluded: true }, lookups())
    expect(r.tourLeaderCost).toBe(160)
    expect(r.subtotalCost).toBe(160)
  })
  it('other line types keep whatever the itinerary stored (unchanged behaviour)', async () => {
    const r = await repriceItineraryServices([day(1, [{ service_type: 'transportation', service_name: 'Van', quantity: 1, unit_cost: 0, total_cost: 0 }])], ctx, lookups())
    expect(r.holes).toEqual([])
    expect(r.services[0].line_total).toBe(0)
  })
})
