import { describe, it, expect } from 'vitest'
import { hotelTierFindings, transportTypeFindings } from '@/lib/rates/rate-checks'

describe('hotelTierFindings', () => {
  it('flags a 5-star hotel saved as standard, once across its room types', () => {
    const out = hotelTierFindings([
      { id: 'a', property_name: 'Marriott Mena House', city: 'Giza', tier: 'standard', star_rating: 5 },
      { id: 'b', property_name: 'Marriott Mena House', city: 'Giza', tier: 'standard', star_rating: 5 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].ids).toEqual(['a', 'b'])
    expect(out[0].expected).toBe('deluxe or luxury')
  })

  it('flags a 3-star saved as luxury, and reads the importer name column', () => {
    const out = hotelTierFindings([{ id: 'c', hotel_name: 'Small Inn', city: 'Luxor', tier: 'luxury', star_rating: 3 }])
    expect(out.map(f => f.name)).toEqual(['Small Inn'])
  })

  it('leaves fitting tiers, unrated hotels and custom tiers alone', () => {
    expect(hotelTierFindings([
      { id: 'd', property_name: 'Four Seasons', city: 'Cairo', tier: 'luxury', star_rating: 5 },
      { id: 'e', property_name: 'Unrated', city: 'Cairo', tier: 'standard', star_rating: null },
      { id: 'f', property_name: 'Custom', city: 'Cairo', tier: 'platinum', star_rating: 3 },
      { id: 'g', property_name: 'Four Star', city: 'Cairo', tier: 'standard', star_rating: 4 },
    ])).toEqual([])
  })
})

describe('transportTypeFindings', () => {
  it('flags an airport route saved as a day tour, once across its vehicles', () => {
    const out = transportTypeFindings([
      { id: '1', route_name: 'Cairo Airport', service_type: 'day_tour', vehicle_type: 'sedan', city: 'Cairo' },
      { id: '2', route_name: 'Cairo Airport', service_type: 'day_tour', vehicle_type: 'van', city: 'Cairo' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].ids).toEqual(['1', '2'])
    expect(out[0].expected).toBe('airport transfer')
  })

  it('flags an airport destination and a Half day route typed otherwise', () => {
    const out = transportTypeFindings([
      { id: '3', route_name: 'GIZ-CAI', service_type: 'intercity_dropoff', city: 'Giza', destination_city: 'Cairo Airport' },
      { id: '4', route_name: 'Half day Giza', service_type: 'day_tour', city: 'Giza' },
    ])
    expect(out.map(f => f.expected).sort()).toEqual(['airport transfer', 'half day'])
  })

  it('leaves correct types alone', () => {
    expect(transportTypeFindings([
      { id: '5', route_name: 'Cairo Airport', service_type: 'airport_transfer', city: 'Cairo' },
      { id: '6', route_name: 'Full day Cairo', service_type: 'day_tour', city: 'Cairo' },
      { id: '7', route_name: 'Half day Luxor', service_type: 'half_day', city: 'Luxor' },
    ])).toEqual([])
  })
})
