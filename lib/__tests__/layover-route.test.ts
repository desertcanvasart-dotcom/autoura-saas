import { describe, it, expect } from 'vitest'
import { isLayoverRoute, plainTransferFor, LAYOVER_TEXT } from '@/lib/rates/layover-route'
import { transportTypeFindings } from '@/lib/rates/rate-checks'

const rows = [
  { id: 'lay', route_name: 'Airport → Full Day → Airport (Sphinx)', service_type: 'airport_transfer', vehicle_type: 'van', city: 'Cairo' },
  { id: 'lay2', route_name: 'CAIRO-AIRPORT-FULL-DAY-AIRPORT', service_type: 'airport_transfer', vehicle_type: 'van', city: 'Cairo' },
  { id: 'plainSedan', route_name: 'Cairo Airport Transfer', service_type: 'airport_transfer', vehicle_type: 'sedan', city: 'Cairo' },
  { id: 'plainVan', route_name: 'Cairo Airport Transfer', service_type: 'airport_transfer', vehicle_type: 'van', city: 'Cairo' },
  { id: 'luxor', route_name: 'Luxor Airport Transfer', service_type: 'airport_transfer', vehicle_type: 'van', city: 'Luxor' },
]

describe('isLayoverRoute', () => {
  it('knows airport → tour → airport routes from plain transfers', () => {
    expect(isLayoverRoute(rows[0])).toBe(true)
    expect(isLayoverRoute(rows[1])).toBe(true)
    expect(isLayoverRoute(rows[2])).toBe(false)
    expect(isLayoverRoute({ route_name: 'Full day Cairo', city: 'Cairo' })).toBe(false)
  })
})

describe('plainTransferFor', () => {
  it('takes the plain transfer in the same city, same vehicle first', () => {
    expect(plainTransferFor(rows[0], rows)?.id).toBe('plainVan')
    expect(plainTransferFor({ ...rows[0], vehicle_type: 'bus' }, rows)?.id).toBe('plainSedan')
  })
  it('is null when the city has no plain transfer', () => {
    expect(plainTransferFor({ ...rows[0], city: 'Aswan' }, rows)).toBeNull()
  })
})

describe('LAYOVER_TEXT', () => {
  it('reads a transit itinerary, not an ordinary arrival', () => {
    expect(LAYOVER_TEXT.test('Layover tour of Cairo between flights')).toBe(true)
    expect(LAYOVER_TEXT.test('Arrive Cairo airport, transfer to Marriott Mena House')).toBe(false)
  })
})

describe('rates check and layover tours', () => {
  it('does not flag a layover tour, whichever type it is saved as', () => {
    expect(transportTypeFindings([rows[0], rows[1], { ...rows[0], id: 'x', service_type: 'day_tour' }])).toEqual([])
  })
})
