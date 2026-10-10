import { describe, it, expect } from 'vitest'
import { citiesOf, facetOf, filterOptions, onePerRoute, routeLabel, vehicleLabel } from '@/app/pricing-grid/lib/option-filters'
import type { RateOption } from '@/app/pricing-grid/types'

const tier = (route: string, vehicle: string, min: number, max: number, rate: number, extra: Record<string, unknown> = {}): RateOption => ({
  id: `${route}__${vehicle.toLowerCase()}`, name: `${vehicle} (${min}-${max} pax) — ${route}`,
  rateEur: rate, rateNonEur: rate, capacity_min: min, capacity_max: max, ...extra,
} as RateOption)

const caiAirport = { city: 'Cairo', origin_city: 'Cairo', service_type: 'airport_transfer' }
const alexTrip = { city: 'Cairo', origin_city: 'Cairo', destination_city: 'Alexandria', service_type: 'intercity_day_trip' }
const luxorTour = { city: 'Luxor', origin_city: 'Luxor', service_type: 'day_tour' }
const routes = [
  tier('CAIRO-AIRPORT', 'Sedan', 1, 2, 30, caiAirport), tier('CAIRO-AIRPORT', 'Van', 3, 12, 60, caiAirport), tier('CAIRO-AIRPORT', 'Bus', 13, 45, 200, caiAirport),
  tier('Cairo → Alexandria', 'Van', 1, 12, 150, alexTrip), tier('Cairo → Alexandria', 'Bus', 13, 45, 400, alexTrip),
  tier('Luxor East Bank', 'Van', 1, 12, 50, luxorTour),
]

describe('onePerRoute', () => {
  it('lists each route once, at the vehicle that seats the group', () => {
    const at30 = onePerRoute(routes, 30)
    expect(at30.map(o => o.id)).toEqual(['CAIRO-AIRPORT__bus', 'Cairo → Alexandria__bus', 'Luxor East Bank__van'])
    expect(onePerRoute(routes, 2).map(o => o.id)).toEqual(['CAIRO-AIRPORT__sedan', 'Cairo → Alexandria__van', 'Luxor East Bank__van'])
  })

  it('a group larger than every vehicle takes the largest', () => {
    expect(onePerRoute(routes, 60)[0].id).toBe('CAIRO-AIRPORT__bus')
  })

  it('names split into route and vehicle', () => {
    expect(routeLabel('Bus (13-45 pax) — CAIRO-AIRPORT')).toBe('CAIRO-AIRPORT')
    expect(vehicleLabel('Bus (13-45 pax) — CAIRO-AIRPORT')).toBe('Bus (13-45 pax)')
    expect(routeLabel('B2B package: Luxor 4d')).toBe('B2B package: Luxor 4d')
  })
})

describe('filterOptions', () => {
  const all = onePerRoute(routes, 4)
  const day = all.filter(o => o.city === 'Cairo')
  const facet = facetOf(all)

  it('offers the cities the options run in or to, and the transport types', () => {
    expect(citiesOf(all)).toEqual(['Alexandria', 'Cairo', 'Luxor'])
    expect(facet).toEqual({ field: 'service_type', values: ['airport_transfer', 'day_tour', 'intercity_day_trip'] })
  })

  it("the day's own list by default; a city or a search looks in everything", () => {
    expect(filterOptions(day, all, { city: '', facet: '', search: '' }, facet)).toHaveLength(2)
    expect(filterOptions(day, all, { city: 'Luxor', facet: '', search: '' }, facet).map(o => o.id)).toEqual(['Luxor East Bank__van'])
    expect(filterOptions(day, all, { city: 'alexandria', facet: '', search: '' }, facet)).toHaveLength(1)
    expect(filterOptions(day, all, { city: '*', facet: '', search: '' }, facet)).toHaveLength(3)
    expect(filterOptions(day, all, { city: '', facet: '', search: 'east bank' }, facet)).toHaveLength(1)
  })

  it('narrows by type', () => {
    expect(filterOptions(day, all, { city: '*', facet: 'airport_transfer', search: '' }, facet).map(o => o.id)).toEqual(['CAIRO-AIRPORT__van'])
  })
})
