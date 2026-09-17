import { describe, it, expect } from 'vitest'
import { propertyFromService, overnightProperty, overnightLabel } from '@/lib/itineraries/overnight-property'

// ============================================
// The hotel or ship a night is spent at
// ============================================
// The day stores only its overnight CITY, so the itinerary page, the PDF and
// the client's share page all said "Overnight in Cairo" and never named the
// hotel — while every path that creates the night's line already names the
// property, each in its own shape.

describe('propertyFromService', () => {
  it('takes the supplier name when the line carries one (AI generator, grid)', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel', supplier_name: 'Steigenberger Nile Palace' }))
      .toEqual({ name: 'Steigenberger Nile Palace', kind: 'hotel' })
  })

  it('reads the engine’s own line shapes', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel - Mena House (Cairo)' }))
      .toEqual({ name: 'Mena House', kind: 'hotel' })
    expect(propertyFromService({ service_type: 'cruise', service_name: 'Nile Cruise - Al Farida (3 nights)' }))
      .toEqual({ name: 'Al Farida', kind: 'cruise' })
  })

  it('reads the generator’s shapes', () => {
    expect(propertyFromService({ service_type: 'cruise', service_name: 'MS Farah - Full Board (3 nights)' }))
      .toEqual({ name: 'MS Farah', kind: 'cruise' })
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Kempinski Nile Hotel (2 persons)' }))
      .toEqual({ name: 'Kempinski Nile Hotel', kind: 'hotel' })
  })

  it('claims nothing from a placeholder that names no property', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel (Cairo)' })).toBeNull()
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel night — no rate' })).toBeNull()
  })

  it('ignores lines that are not the night itself', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel supplement - Single (Mena House)' })).toBeNull()
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Guide bed - Mena House' })).toBeNull()
    expect(propertyFromService({ service_type: 'guide', service_name: 'English Speaking Guide', supplier_name: 'Ahmed' })).toBeNull()
    expect(propertyFromService({ service_type: 'transportation', service_name: 'Coach', supplier_name: 'Nile Transport Co' })).toBeNull()
  })
})

describe('overnightProperty', () => {
  it('finds the night among the day’s other services', () => {
    expect(overnightProperty([
      { service_type: 'guide', service_name: 'Guide', supplier_name: 'Ahmed' },
      { service_type: 'entrance', service_name: 'Karnak' },
      { service_type: 'accommodation', service_name: 'Hotel', supplier_name: 'Sonesta St George' },
    ])).toEqual({ name: 'Sonesta St George', kind: 'hotel' })
  })

  it('is null for a day with no stay, and for no services at all', () => {
    expect(overnightProperty([{ service_type: 'guide', service_name: 'Guide' }])).toBeNull()
    expect(overnightProperty([])).toBeNull()
    expect(overnightProperty(null)).toBeNull()
  })
})

describe('overnightLabel', () => {
  it('reads "hotel, city"', () => {
    expect(overnightLabel({ name: 'Mena House', kind: 'hotel' }, 'Cairo')).toBe('Mena House, Cairo')
  })

  it('does not repeat the city when the hotel name already carries it', () => {
    expect(overnightLabel({ name: 'Cairo Marriott', kind: 'hotel' }, 'Cairo')).toBe('Cairo Marriott')
  })

  it('names a ship on its own — a cruise night is not "in" a city', () => {
    expect(overnightLabel({ name: 'Al Farida', kind: 'cruise' }, 'Aswan')).toBe('Al Farida')
  })

  it('falls back to the city alone, exactly as the page read before', () => {
    expect(overnightLabel(null, 'Luxor')).toBe('Luxor')
    expect(overnightLabel(null, null)).toBe('')
  })
})
