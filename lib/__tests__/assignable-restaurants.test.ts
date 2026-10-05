// Reported 2026-10-06: the itinerary's Resource Assignment → Restaurants showed
// "All Cities (0)". The operator's restaurants were all under Rates → Meals;
// the picker read only the Restaurants directory.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { assignableRestaurants } from '@/lib/resources/assignable-restaurants'

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
