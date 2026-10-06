import { describe, it, expect } from 'vitest'
import { resolveOvernightCities, type OvernightDay } from '@/lib/itineraries/overnight-city'
import { overnightCitiesFor } from '@/lib/itineraries/grid-overnight'
import type { GridDay } from '@/app/pricing-grid/types'

// ============================================================================
// Live ITN-S-2026-8987 (Cairo & Alexandria Classic): Day 3 is a day trip to
// Alexandria, its hotel Marriott Mena House in Cairo, and the itinerary said
// "Overnight in Alexandria" — the Pricing Grid saved the day's city as the
// night's city. Where a night is spent comes from the bed, not the sightseeing.
// ============================================================================

const day = (city: string, extra: Partial<OvernightDay> = {}): OvernightDay => ({ city, overnight: true, ...extra })

describe('resolveOvernightCities', () => {
  it('a Cairo-based day trip to Alexandria sleeps in Cairo — from the hotel', () => {
    expect(resolveOvernightCities([
      day('Cairo', { propertyCity: 'Cairo' }),
      day('Giza', { propertyCity: 'Cairo' }),
      day('Alexandria', { propertyCity: 'Cairo' }),
      day('Cairo', { overnight: false }),
    ])).toEqual(['Cairo', 'Cairo', 'Cairo', null])
  })

  it('a day trip with no hotel on the day still sleeps where the night before was', () => {
    expect(resolveOvernightCities([
      day('Cairo', { propertyCity: 'Cairo' }),
      day('Alexandria'),
    ])).toEqual(['Cairo', 'Cairo'])
  })

  it('an intercity transfer or flight moves the night to the day’s city', () => {
    expect(resolveOvernightCities([
      day('Cairo'),
      day('Luxor', { intercity: 'flight' }),
      day('Aswan', { intercity: 'road' }),
      day('Kom Ombo'),
    ])).toEqual(['Cairo', 'Luxor', 'Aswan', 'Aswan'])
  })

  it('a booked hotel wins over everything else that day', () => {
    expect(resolveOvernightCities([
      day('Cairo'),
      day('Luxor', { intercity: 'flight', propertyCity: 'Luxor West Bank' }),
    ])).toEqual(['Cairo', 'Luxor West Bank'])
  })

  it('cruise nights are on board; the first night ashore after is the day’s city, not the city before the cruise', () => {
    expect(resolveOvernightCities([
      day('Cairo', { propertyCity: 'Cairo' }),
      day('Luxor', { cruiseShip: 'Sonesta St. George' }),
      day('Edfu', { cruiseShip: 'Sonesta St. George' }),
      day('Aswan'),
    ])).toEqual(['Cairo', 'On board Sonesta St. George', 'On board Sonesta St. George', 'Aswan'])
  })

  it('a departure day has no night; the first night with nothing else known is the day’s city', () => {
    expect(resolveOvernightCities([day('Hurghada'), day('Hurghada', { overnight: false })])).toEqual(['Hurghada', null])
  })

  it('blank values are not cities', () => {
    expect(resolveOvernightCities([day('  ', { propertyCity: ' ' }), day('Cairo', { propertyCity: '' })])).toEqual([null, 'Cairo'])
  })
})

// The grid save: the night's city comes from the hotel row the day's
// accommodation was priced from (grid-overnight.ts).

const MENA = '11111111-1111-4111-8111-111111111111'
const SHIP = '22222222-2222-4222-8222-222222222222'
const gridDay = (dayNumber: number, city: string, extra: Partial<GridDay> = {}, picks: Record<string, string> = {}): GridDay => ({
  id: `d${dayNumber}`, dayNumber, title: '', city, description: '', isExpanded: false,
  slots: Object.entries(picks).map(([slotId, rateId]) => ({
    slotId, selectedItems: [{ rateId, name: slotId, rateEur: 1, rateNonEur: 1 }], customAmount: 0,
  })),
  ...extra,
})
const stays = {
  hotelCity: new Map([[MENA, 'Cairo']]),
  cruiseShip: new Map([[SHIP, 'Sonesta St. George']]),
}

describe('overnightCitiesFor (the grid save)', () => {
  it('ITN-S-2026-8987: the Alexandria day trip sleeps at Mena House, in Cairo', () => {
    const days = [
      gridDay(1, 'Cairo', { dayType: 'arrival' }, { accommodation: MENA }),
      gridDay(2, 'Giza', {}, { accommodation: MENA }),
      gridDay(3, 'Alexandria', {}, { accommodation: MENA }),
      gridDay(4, 'Cairo', { dayType: 'departure' }),
    ]
    expect([...overnightCitiesFor(days, stays)]).toEqual([[1, 'Cairo'], [2, 'Cairo'], [3, 'Cairo'], [4, null]])
  })

  it('a cruise day is on board; days are taken in day order whatever order they arrive in', () => {
    const days = [
      gridDay(2, 'Luxor', { dayType: 'cruise' }, { cruise: SHIP }),
      gridDay(1, 'Cairo', {}, { accommodation: MENA }),
    ]
    expect(overnightCitiesFor(days, stays).get(2)).toBe('On board Sonesta St. George')
  })

  it('a tours-only trip (no hotel sold) still names where the night is', () => {
    const days = [gridDay(1, 'Cairo'), gridDay(2, 'Alexandria')]
    expect([...overnightCitiesFor(days, stays).values()]).toEqual(['Cairo', 'Cairo'])
  })

  it('a hotel the lookup could not find leaves the night to the rest of the rule', () => {
    const days = [gridDay(1, 'Luxor', { dayType: 'transfer', intercity: 'flight' }, { accommodation: '33333333-3333-4333-8333-333333333333' })]
    expect(overnightCitiesFor(days, stays).get(1)).toBe('Luxor')
  })
})
