import { describe, it, expect } from 'vitest'
import { citiesOf, facetsOf, filterOptions, onePerRoute, repickVehicles, routeLabel, vehicleLabel } from '@/app/pricing-grid/lib/option-filters'
import type { GridDay, RateOption } from '@/app/pricing-grid/types'

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
  const f = (city: string, search = '', facets = {}) => filterOptions(day, all, { city, facets, search })

  it('offers the cities the options run in or to, and the transport types', () => {
    expect(citiesOf(all)).toEqual(['Alexandria', 'Cairo', 'Luxor'])
    expect(facetsOf(all)).toEqual([{ field: 'service_type', values: ['airport_transfer', 'day_tour', 'intercity_day_trip'] }])
  })

  it("the day's own list by default; a city or a search looks in everything", () => {
    expect(f('')).toHaveLength(2)
    expect(f('Luxor').map(o => o.id)).toEqual(['Luxor East Bank__van'])
    expect(f('alexandria')).toHaveLength(1)
    expect(f('*')).toHaveLength(3)
    expect(f('', 'east bank')).toHaveLength(1)
  })

  it('narrows by type', () => {
    expect(f('*', '', { service_type: 'airport_transfer' }).map(o => o.id)).toEqual(['CAIRO-AIRPORT__van'])
  })
})

describe('facets for hotels and guides', () => {
  const guides = [
    { id: 'g1', name: 'English (Egyptologist)', rateEur: 50, rateNonEur: 50, city: 'Cairo', language: 'English', category: 'Egyptologist' },
    { id: 'g2', name: 'Spanish (Egyptologist)', rateEur: 55, rateNonEur: 55, city: 'Cairo', language: 'Spanish', category: 'Egyptologist' },
    { id: 'g3', name: 'English (Assistant)', rateEur: 20, rateNonEur: 20, city: 'Luxor', language: 'English', category: 'Assistant' },
  ] as RateOption[]

  it('one select per field with more than one value', () => {
    expect(facetsOf(guides).map(x => x.field)).toEqual(['category', 'language'])
    expect(filterOptions(guides, guides, { city: '*', facets: { language: 'English', category: 'Assistant' }, search: '' }).map(o => o.id)).toEqual(['g3'])
  })

  it('hotels narrow by board basis', () => {
    const hotels = [
      { id: 'h1', name: 'Barcelo', rateEur: 40, rateNonEur: 40, city: 'Cairo', board_basis: 'BB' },
      { id: 'h2', name: 'Pyramids Inn', rateEur: 45, rateNonEur: 45, city: 'Cairo', board_basis: 'HB' },
    ] as RateOption[]
    expect(facetsOf(hotels)).toEqual([{ field: 'board_basis', values: ['BB', 'HB'] }])
  })
})

describe('cruises narrow by port and cabin', () => {
  const cruises = [
    { id: 'c1', name: 'MS Nile Star (4N, Standard)', rateEur: 80, rateNonEur: 80, origin_city: 'Luxor', destination_city: 'Aswan', category: 'Standard' },
    { id: 'c2', name: 'MS Nile Star (4N, Suite)', rateEur: 140, rateNonEur: 140, origin_city: 'Luxor', destination_city: 'Aswan', category: 'Suite' },
    { id: 'c3', name: 'MS Sonesta (3N, Standard)', rateEur: 90, rateNonEur: 90, origin_city: 'Aswan', destination_city: 'Luxor', category: 'Standard' },
  ] as RateOption[]

  it('the ports as cities, the cabin as category', () => {
    expect(citiesOf(cruises)).toEqual(['Aswan', 'Luxor'])
    expect(facetsOf(cruises)).toEqual([{ field: 'category', values: ['Standard', 'Suite'] }])
    expect(filterOptions(cruises, cruises, { city: '*', facets: { category: 'Suite' }, search: '' }).map(o => o.id)).toEqual(['c2'])
  })
})

// Changing the travellers in the Quote Builder kept the vehicle picked for the
// old group: 2 pax in a sedan, raised to 10, still priced the sedan.
describe('repickVehicles', () => {
  const day = (rateId: string, extra: Record<string, unknown> = {}): GridDay => ({
    id: 'd1', dayNumber: 1, title: 'Cairo', city: 'Cairo',
    slots: [
      { slotId: 'route', selectedItems: [{ rateId, name: 'x', rateEur: 30, rateNonEur: 30, ...extra }], customAmount: 0 },
      { slotId: 'water', selectedItems: [{ rateId: 'w', name: 'Water', rateEur: 2, rateNonEur: 2 }], customAmount: 0 },
    ],
  } as GridDay)

  it('moves a picked route to the vehicle that seats the new group', () => {
    const [d] = repickVehicles([day('CAIRO-AIRPORT__sedan')], routes, 10)
    const item = d.slots[0].selectedItems[0]
    expect(item.rateId).toBe('CAIRO-AIRPORT__van')
    expect(item.rateEur).toBe(60)
    expect(item.name).toBe('Van (3-12 pax) — CAIRO-AIRPORT')
  })

  it('returns the same days when every vehicle already fits', () => {
    const days = [day('CAIRO-AIRPORT__van')]
    expect(repickVehicles(days, routes, 5)).toBe(days)
  })

  it('leaves untiered transport (a cruise package) alone', () => {
    const days = [day('cruise-pkg-1')]
    expect(repickVehicles(days, routes, 30)).toBe(days)
  })
})
