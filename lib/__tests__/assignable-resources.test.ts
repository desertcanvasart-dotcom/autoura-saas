// Reported 2026-10-06: the itinerary's Resource Assignment → Restaurants showed
// "All Cities (0)". The operator's restaurants were all under Rates → Meals;
// the picker read only the Restaurants directory.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { assignableRestaurants, assignableHotels, assignableCruises, cruiseRouteKey } from '@/lib/resources/assignable'

const rate = (over: Record<string, unknown> = {}) => ({
  id: 'r1', restaurant_name: 'Abou El Sid', supplier_id: null, supplier_name: null,
  city: 'Cairo', cuisine_type: 'Egyptian', is_active: true, ...over,
})

describe('restaurants from Rates → Meals', () => {
  it('are offered with their city', () => {
    const out = assignableRestaurants([], [rate()])
    expect(out).toEqual([{ id: 'r1', name: 'Abou El Sid', city: 'Cairo', cuisine_type: 'Egyptian', phone: null, source: 'meal_rates' }])
  })

  it('appear once per restaurant per city, however many meal rows they have', () => {
    const out = assignableRestaurants([], [
      rate({ id: 'r1' }), rate({ id: 'r2' }), rate({ id: 'r3', restaurant_name: ' abou el sid ' }),
      rate({ id: 'r4', city: 'Alexandria' }),
    ])
    expect(out.map(r => `${r.name}|${r.city}`)).toEqual(['Abou El Sid|Alexandria', 'Abou El Sid|Cairo'])
  })

  it('take the linked supplier id, which WhatsApp notify looks up', () => {
    expect(assignableRestaurants([], [rate({ supplier_id: 'sup-9' })])[0].id).toBe('sup-9')
  })

  it('fall back to the supplier name when the restaurant name is blank', () => {
    expect(assignableRestaurants([], [rate({ restaurant_name: '', supplier_name: 'Zooba' })])[0].name).toBe('Zooba')
  })

  it('skip inactive and nameless rows', () => {
    expect(assignableRestaurants([], [rate({ is_active: false }), rate({ id: 'x', restaurant_name: null })])).toEqual([])
  })
})

describe('with the Restaurants directory', () => {
  const contact = { id: 'c1', name: 'Abou El Sid', city: 'Cairo', cuisine_type: null, phone: '+20 100', whatsapp: null, is_active: true }

  it('the directory entry wins when both name the same restaurant in the same city', () => {
    const out = assignableRestaurants([contact], [rate()])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'c1', source: 'directory', phone: '+20 100' })
  })

  it('both are listed when they are different restaurants', () => {
    expect(assignableRestaurants([contact], [rate({ restaurant_name: 'Zooba' })])).toHaveLength(2)
  })

  it('sorts by city, then name', () => {
    const out = assignableRestaurants([], [rate({ restaurant_name: 'Zooba' }), rate({ id: 'a', restaurant_name: 'Andrea', city: 'Giza' }), rate({ id: 'b', restaurant_name: 'Abou El Sid' })])
    expect(out.map(r => r.name)).toEqual(['Abou El Sid', 'Zooba', 'Andrea'])
  })
})

describe('the picker', () => {
  it('reads the merged list, not the directory alone', () => {
    const src = readFileSync(join(process.cwd(), 'app/components/ResourceAssignmentV2.tsx'), 'utf8')
    expect(src).toContain("apiEndpoint: '/api/resources/restaurants/assignable'")
  })
})

// Same report, hotels and cruises: "undefined - Abu Simbel" listed twice, and
// 88 cruise rows as "undefined - <ship>". Both pickers read rate tables (a row
// per room type / cabin and season) and looked for a `name` neither has.
describe('hotels from Rates → Hotels', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'h1', property_id: null, property_name: 'Seti Abu Simbel', hotel_name: null,
    supplier_name: null, city: 'Abu Simbel', star_rating: 4, is_active: true, ...over,
  })

  it('are named, once per hotel per city, whatever the room types', () => {
    const out = assignableHotels([row(), row({ id: 'h2' }), row({ id: 'h3', star_rating: null })])
    expect(out).toEqual([{ id: 'h1', name: 'Seti Abu Simbel', city: 'Abu Simbel', star_rating: 4 }])
  })

  it('fall back to hotel_name, then the supplier name', () => {
    expect(assignableHotels([row({ property_name: null, hotel_name: 'Old Cataract' })])[0].name).toBe('Old Cataract')
    expect(assignableHotels([row({ property_name: null, supplier_name: 'Steigenberger' })])[0].name).toBe('Steigenberger')
  })

  it('keep one stable id per hotel: the property when linked, else the smallest row id', () => {
    expect(assignableHotels([row({ id: 'h9' }), row({ id: 'h2' })])[0].id).toBe('h2')
    expect(assignableHotels([row({ property_id: 'p1' }), row({ id: 'h2', property_id: 'p1' })])[0].id).toBe('p1')
  })

  it('list the same name in two cities as two hotels; skip inactive and nameless rows', () => {
    const out = assignableHotels([row(), row({ id: 'h2', city: 'Aswan' }), row({ id: 'x', is_active: false, city: 'Luxor' }), row({ id: 'y', property_name: '' , city: 'Giza'})])
    expect(out.map(h => h.city)).toEqual(['Abu Simbel', 'Aswan'])
  })
})

describe('Nile cruises from Rates → Nile Cruises', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1', property_id: null, ship_name: 'Adonis', route_name: 'Luxor to Aswan',
    embark_city: 'Luxor', disembark_city: 'Aswan', is_active: true, ...over,
  })

  it('are named by ship, once per route, whatever the cabins', () => {
    const out = assignableCruises([row(), row({ id: 'c2' }), row({ id: 'c3', route_name: 'Aswan to Luxor', embark_city: 'Aswan', disembark_city: 'Luxor' })])
    expect(out).toEqual([
      { id: 'c3', name: 'Adonis', route: 'aswan_luxor' },
      { id: 'c1', name: 'Adonis', route: 'luxor_aswan' },
    ])
  })

  it('never give two entries the same id, even when one ship sails two routes', () => {
    const out = assignableCruises([row({ property_id: 'p1' }), row({ id: 'c3', property_id: 'p1', route_name: 'Aswan to Luxor', embark_city: 'Aswan', disembark_city: 'Luxor' })])
    expect(new Set(out.map(c => c.id)).size).toBe(2)
  })

  it('read routes however they are written', () => {
    expect(cruiseRouteKey({ route_name: 'LXR-ASW', embark_city: null, disembark_city: null })).toBe('luxor_aswan')
    expect(cruiseRouteKey({ route_name: null, embark_city: 'Aswan', disembark_city: 'Luxor' })).toBe('aswan_luxor')
    expect(cruiseRouteKey({ route_name: '7 nights round trip', embark_city: 'Luxor', disembark_city: 'Luxor' })).toBe('round_trip')
    expect(cruiseRouteKey({ route_name: 'Lake Nasser', embark_city: null, disembark_city: null })).toBe('Lake Nasser')
  })
})

describe('the hotel and cruise pickers', () => {
  const src = readFileSync(join(process.cwd(), 'app/components/ResourceAssignmentV2.tsx'), 'utf8')
  it('read the grouped lists', () => {
    expect(src).toContain("apiEndpoint: '/api/resources/hotels/assignable'")
    expect(src).toContain("apiEndpoint: '/api/cruises/assignable'")
  })
})
