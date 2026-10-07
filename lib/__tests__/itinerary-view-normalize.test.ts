import { describe, it, expect } from 'vitest'
import { normalizeItineraryForView, normalizeDaysForView } from '@/lib/itineraries/view-normalize'

// "View itinerary" after a Pricing Grid save crashed the page (2026-10-04):
// the grid stores no client name as NULL, and the page called
// client_name.replace(...) while rendering.
describe('itinerary view normalisation', () => {
  it('gives a Pricing Grid itinerary with no client its neutral values', () => {
    const it = normalizeItineraryForView({
      id: 'i1', itinerary_code: 'ITN-1', client_name: null, client_email: null, client_phone: null,
      trip_name: 'Nile', status: null, currency: null, total_cost: '1250.5', num_adults: 2, num_children: null,
    })
    expect(it.client_name).toBe('')
    expect(() => it.client_name.replace(/\s+/g, '_')).not.toThrow()
    expect(it.status).toBe('draft')
    expect(it.currency).toBe('EUR')
    expect(it.total_cost).toBe(1250.5)
    expect(it.num_children).toBe(0)
    expect(it.id).toBe('i1')
  })

  it('keeps real values as they are', () => {
    const it = normalizeItineraryForView({ client_name: 'Jamie', status: 'confirmed', currency: 'USD', total_cost: 900 })
    expect(it).toMatchObject({ client_name: 'Jamie', status: 'confirmed', currency: 'USD', total_cost: 900 })
  })

  it("gives every service a type, a quantity and a numeric total", () => {
    const days = normalizeDaysForView([
      { id: 'd1', services: [{ id: 's1', service_type: null, service_name: null, quantity: null, total_cost: null }] },
      { id: 'd2', services: null },
    ])
    expect(days[0].services).toEqual([{ id: 's1', service_type: 'other', service_name: '', quantity: 1, total_cost: 0 }])
    expect(() => (days[0].services as Array<{ total_cost: number }>)[0].total_cost.toFixed(2)).not.toThrow()
    expect(days[1].services).toEqual([])
  })
})
