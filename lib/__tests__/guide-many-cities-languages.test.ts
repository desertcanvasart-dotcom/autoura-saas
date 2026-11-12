// A guide may work several cities (or everywhere) and one price may be saved
// for several cities and languages at once (migration 461, 2026-11-07).
import { describe, it, expect } from 'vitest'
import { citiesOf, coversCity, citiesLabel, cleanOtherCities } from '@/lib/suppliers/supplier-cities'
import { guideRateLists } from '@/lib/guides/guide-rate-lists'
import { pickGuideRateRow, rateCities, rateLanguages, rateSpeaks, languagesWithRates } from '@/lib/guides/guide-language'
import { sameService } from '@/lib/bookings/cover-options'
import { alignGuideLanguage, guideLanguages, preferLanguage } from '@/app/pricing-grid/lib/guide-language'
import { filterOptions, facetsOf } from '@/app/pricing-grid/lib/option-filters'
import type { GridDay, RateOption } from '@/app/pricing-grid/types'
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

describe('one guide price covers several cities and languages (463)', () => {
  it('the form\'s lists become ONE row: first in city/guide_language, the rest in the lists', () => {
    expect(guideRateLists({ cities: ['Aswan', 'Edfu', 'Kom Ombo', 'edfu', ' '], languages: ['english', 'french', 'english'] })).toEqual({
      city: 'Aswan', other_cities: ['Edfu', 'Kom Ombo'], guide_language: 'english', other_languages: ['french'],
    })
  })

  it('no city picked is the any-city price, with no other cities', () => {
    expect(guideRateLists({ cities: [], languages: ['english'] })).toMatchObject({ city: null, other_cities: [] })
    expect(guideRateLists({ city: '', other_cities: ['Luxor'], guide_language: 'english' })).toMatchObject({ city: null, other_cities: [] })
  })

  it('the row\'s own shape (CSV, PUT) reads the same', () => {
    expect(guideRateLists({ city: 'Cairo', other_cities: ['Luxor', 'Cairo'], guide_language: 'english', other_languages: ['spanish'] })).toEqual({
      city: 'Cairo', other_cities: ['Luxor'], guide_language: 'english', other_languages: ['spanish'],
    })
  })

  it('no language is refused (blank guide_language)', () => {
    expect(guideRateLists({ cities: ['Cairo'], languages: [] }).guide_language).toBe('')
  })

  const ahmed = { id: 'ahmed', city: 'Aswan', other_cities: ['Edfu', 'Kom Ombo'], guide_language: 'english', other_languages: ['french'], base_rate_eur: 5000 }

  it('a row\'s cities and languages, first first', () => {
    expect(rateCities(ahmed)).toEqual(['Aswan', 'Edfu', 'Kom Ombo'])
    expect(rateCities({ city: null, other_cities: [] })).toEqual([])
    expect(rateLanguages(ahmed)).toEqual(['english', 'french'])
  })

  it('the engine prices a day in ANY of its cities from the one row', () => {
    for (const city of ['Aswan', 'edfu', 'Kom Ombo']) {
      const pick = pickGuideRateRow([ahmed], city)
      expect(pick).toMatchObject({ kind: 'one', rate: 5000, cityMatched: true })
    }
    expect(pickGuideRateRow([ahmed], 'Luxor')).toEqual({ kind: 'none' })
  })

  it('a city\'s own price still beats the any-city price; two prices covering one city at different amounts are a gap', () => {
    const anyCity = { id: 'any', city: null, guide_language: 'english', base_rate_eur: 3000 }
    expect(pickGuideRateRow([ahmed, anyCity], 'Edfu')).toMatchObject({ kind: 'one', rate: 5000 })
    expect(pickGuideRateRow([ahmed, anyCity], 'Luxor')).toMatchObject({ kind: 'one', rate: 3000, cityMatched: false })
    const edfuOnly = { id: 'e', city: 'Edfu', guide_language: 'english', base_rate_eur: 4000 }
    expect(pickGuideRateRow([ahmed, edfuOnly], 'Edfu')).toMatchObject({ kind: 'ambiguous' })
  })

  it('the language matches the first OR any further language', () => {
    const items = [{ key: 'english', label: 'English' }, { key: 'french', label: 'French' }, { key: 'german', label: 'German' }]
    expect(rateSpeaks(ahmed, 'french', items)).toBe(true)
    expect(rateSpeaks(ahmed, 'german', items)).toBe(false)
    expect(languagesWithRates(items, [ahmed]).filter(l => l.hasRate).map(l => l.key)).toEqual(['english', 'french'])
  })

  it('another supplier covers a line only if its price covers every city and language of ours', () => {
    const ours = { id: 'a', supplier_id: 's1', city: 'Aswan', other_cities: ['Edfu'], guide_language: 'english', other_languages: [], guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot' }
    const wider = { ...ours, id: 'b', supplier_id: 's2', city: 'Edfu', other_cities: ['Aswan', 'Luxor'], other_languages: ['french'] }
    const narrower = { ...ours, id: 'c', supplier_id: 's3', other_cities: [] }
    expect(sameService('guide_rates', ours, wider)).toBe(true)
    expect(sameService('guide_rates', ours, narrower)).toBe(false)
    expect(sameService('guide_rates', ours, { ...wider, guide_type: 'senior' })).toBe(false)
  })
})

describe('the pricing grid reads a guide price\'s lists', () => {
  const opt = (id: string, extra: Partial<RateOption>): RateOption => ({ id, name: id, rateEur: 100, rateNonEur: 100, ...extra })
  const ahmed = opt('ahmed', { city: 'Aswan', cities: ['Aswan', 'Edfu'], language: 'English', languages: ['English', 'French'], category: 'egyptologist' })
  const luxorDe = opt('luxor-de', { city: 'Luxor', cities: ['Luxor'], language: 'German', languages: ['German'], category: 'egyptologist' })

  it('the city filter and the language facet see every city and language', () => {
    const filter = { city: 'Edfu', facets: {}, search: '' }
    expect(filterOptions([], [ahmed, luxorDe], filter).map(o => o.id)).toEqual(['ahmed'])
    expect(facetsOf([ahmed, luxorDe]).find(f => f.field === 'language')?.values).toEqual(['English', 'French', 'German'])
    expect(filterOptions([], [ahmed, luxorDe], { city: '*', facets: { language: 'French' }, search: '' }).map(o => o.id)).toEqual(['ahmed'])
  })

  it('the trip language: a price that already speaks it stays; the list offers every language', () => {
    expect(guideLanguages([ahmed, luxorDe])).toEqual(['English', 'French', 'German'])
    expect(preferLanguage([ahmed, luxorDe], 'French').map(o => o.id)).toEqual(['ahmed'])
    const day = { dayNumber: 1, slots: [{ slotId: 'guide', selectedItems: [{ rateId: 'ahmed', name: 'ahmed', rateEur: 100, rateNonEur: 100 }] }] } as unknown as GridDay
    const r = alignGuideLanguage([day], [ahmed, luxorDe], 'French')
    expect(r.changed).toEqual([])
    expect(r.unmatched).toEqual([])
  })
})
