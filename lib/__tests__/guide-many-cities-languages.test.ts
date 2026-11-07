// A guide may work several cities (or everywhere) and one price may be saved
// for several cities and languages at once (migration 461, 2026-11-07).
import { describe, it, expect } from 'vitest'
import { citiesOf, coversCity, citiesLabel, cleanOtherCities } from '@/lib/suppliers/supplier-cities'
import { guideRateCombos, comboServiceCode } from '@/lib/guides/guide-rate-combos'
import { filterSupplierFields } from '@/lib/suppliers/supplier-fields'
import { parseSuppliersCsv } from '@/lib/suppliers/import-csv'
import { supplierToGuide } from '@/lib/guides/supplier-guide'

describe('which cities a supplier works in', () => {
  const cairoLuxor = { city: 'Cairo', other_cities: ['Luxor', 'Aswan'] }

  it('the base city and the others, base first, no repeats', () => {
    expect(citiesOf({ city: 'Cairo', other_cities: ['Luxor', 'cairo', ' ', 'Luxor'] })).toEqual(['Cairo', 'Luxor'])
    expect(citiesOf({ city: null, other_cities: null })).toEqual([])
  })

  it('covers any listed city, case-blind', () => {
    expect(coversCity(cairoLuxor, 'luxor')).toBe(true)
    expect(coversCity(cairoLuxor, 'Cairo')).toBe(true)
    expect(coversCity(cairoLuxor, 'Alexandria')).toBe(false)
  })

  it('a guide with one city covers exactly that city, as before', () => {
    expect(coversCity({ city: 'Cairo' }, 'Cairo')).toBe(true)
    expect(coversCity({ city: 'Cairo' }, 'Luxor')).toBe(false)
  })

  it('travels everywhere covers every city', () => {
    expect(coversCity({ city: 'Cairo', works_all_cities: true }, 'Siwa')).toBe(true)
    expect(citiesLabel({ city: 'Cairo', works_all_cities: true })).toBe('All cities')
    expect(citiesLabel(cairoLuxor)).toBe('Cairo · Luxor · Aswan')
  })

  it('stored other cities drop blanks, repeats and the base city', () => {
    expect(cleanOtherCities('Cairo', ['Luxor', 'cairo', '', 'Luxor ', 7])).toEqual(['Luxor'])
    expect(cleanOtherCities('Cairo', 'Luxor')).toEqual([])
  })
})

describe('the supplier API writes the new fields, cleaned', () => {
  it('keeps cities, everywhere and languages; drops unknown keys', () => {
    expect(filterSupplierFields({
      name: 'Ahmed', city: 'Cairo', other_cities: ['Luxor', 'Cairo'], works_all_cities: 'yes',
      languages: ['english', 'french', 'english', ''], hacker: 1,
    })).toEqual({ name: 'Ahmed', city: 'Cairo', other_cities: ['Luxor'], works_all_cities: false, languages: ['english', 'french'] })
  })

  it('the guide view lists every city the guide covers', () => {
    const g = supplierToGuide({ id: 'g1', name: 'Ahmed', city: 'Cairo', other_cities: ['Luxor'], works_all_cities: false, status: 'active' } as never)
    expect(g.cities).toEqual(['Cairo', 'Luxor'])
  })
})

describe('the suppliers CSV carries them both ways', () => {
  it('reads Also Works In, All Cities and Languages', () => {
    const csv = 'Name,Type,City,Also Works In,All Cities,Languages\nAhmed,guide,Cairo,Luxor|Aswan,yes,english|french\n'
    const r = parseSuppliersCsv(csv)
    expect(r.refused).toEqual([])
    expect(r.records[0]).toMatchObject({ other_cities: ['Luxor', 'Aswan'], works_all_cities: true, languages: ['english', 'french'] })
  })

  it('refuses an All Cities cell that is not yes or no', () => {
    const r = parseSuppliersCsv('Name,Type,All Cities\nAhmed,guide,maybe\n')
    expect(r.records).toEqual([])
    expect(r.refused[0].reason).toMatch(/yes or no/)
  })
})

describe('one guide price saved for several cities and languages', () => {
  it('the form alone is one row, as before', () => {
    expect(guideRateCombos({ city: 'Cairo', guide_language: 'english' })).toEqual([{ city: 'Cairo', guide_language: 'english' }])
  })

  it('a blank city is "any city" (null)', () => {
    expect(guideRateCombos({ city: '', guide_language: 'english' })).toEqual([{ city: null, guide_language: 'english' }])
  })

  it('every language in every city, primary pair first, no repeats', () => {
    const combos = guideRateCombos({
      city: 'Cairo', guide_language: 'english',
      also_cities: ['Luxor', 'cairo'], also_languages: ['french', 'english'],
    })
    expect(combos).toEqual([
      { city: 'Cairo', guide_language: 'english' },
      { city: 'Luxor', guide_language: 'english' },
      { city: 'Cairo', guide_language: 'french' },
      { city: 'Luxor', guide_language: 'french' },
    ])
  })

  it('no language is no row', () => {
    expect(guideRateCombos({ city: 'Cairo', guide_language: '' })).toEqual([])
  })

  it('codes stay distinct: the form code, then -2, -3', () => {
    expect([0, 1, 2].map(i => comboServiceCode('GD-ABC', i))).toEqual(['GD-ABC', 'GD-ABC-2', 'GD-ABC-3'])
  })
})
