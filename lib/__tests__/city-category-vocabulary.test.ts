import { describe, it, expect } from 'vitest'
import { cityOptionsFor } from '@/components/CitySelect'
import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'

// Every city dropdown offers the shared vocabulary; a stored value outside
// it (legacy free text) stays selectable so editing never blanks a row.
describe('cityOptionsFor', () => {
  const cities = ['Cairo', 'Luxor', 'Aswan']

  it('offers the vocabulary as-is when the value is in it or empty', () => {
    expect(cityOptionsFor(cities, '')).toEqual(cities)
    expect(cityOptionsFor(cities, 'Luxor')).toEqual(cities)
  })

  it('keeps a legacy value selectable, ahead of the vocabulary', () => {
    expect(cityOptionsFor(cities, 'Al Farida Pier')).toEqual(['Al Farida Pier', ...cities])
  })

  it('hides the excluded city (origin when picking a destination)', () => {
    expect(cityOptionsFor(cities, '', 'Cairo')).toEqual(['Luxor', 'Aswan'])
  })

  it('the Egypt fallback list is the full one, not a page-local subset', () => {
    for (const c of ['Abu Simbel', 'Esna', 'Kom Ombo', 'Siwa', 'Taba']) {
      expect(EGYPT_CITIES).toContain(c)
    }
  })
})

