// A day is in ONE city.
//
// Found on live data, 2026-09-20: 21 of 144 template days store a LIST in
// `city` — "Cairo; Luxor", "Abu Simbel; Aswan", "Cairo; Giza; Memphis;
// Saqqara". Every rate for a day is looked up by that city, so the engine found
// nothing and told the operator to add a sedan rate "in Cairo; Luxor".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'
import { placesNamed, namesSeveralPlaces, severalPlacesReason } from '@/lib/tours/day-city'
import { parseDaysCsv, serializeDaysCsv } from '@/lib/tours/itinerary-csv'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

describe('the rule', () => {
  it('one place is one place, whatever it is called', () => {
    for (const city of ['Cairo', 'Sharm El-Sheikh', 'Bahariya Oasis', ' Luxor ']) {
      expect(namesSeveralPlaces(city)).toBe(false)
    }
    expect(placesNamed(' Luxor ')).toEqual(['Luxor'])
  })

  it('a blank is not a list — that is a different gap', () => {
    for (const city of ['', undefined, null, 7]) expect(namesSeveralPlaces(city)).toBe(false)
  })

  it('reads the separators this app\'s own sheets use', () => {
    expect(placesNamed('Cairo; Giza; Memphis; Saqqara')).toEqual(['Cairo', 'Giza', 'Memphis', 'Saqqara'])
    expect(placesNamed('Edfu|Kom Ombo')).toEqual(['Edfu', 'Kom Ombo'])
    // A stray separator is not a second place.
    expect(namesSeveralPlaces('Aswan;')).toBe(false)
  })

  it('says how many, which, and what a day\'s city is for', () => {
    const reason = severalPlacesReason('Abu Simbel; Aswan')
    expect(reason).toContain('2 places (Abu Simbel, Aswan)')
    expect(reason).toMatch(/ONE city/)
    expect(reason).toMatch(/where the night is/)
  })

  it('does NOT choose one by position — the live rows break every such rule', () => {
    // "last = the night" would put this hotel in Saqqara.
    expect(placesNamed('Cairo; Giza; Memphis; Saqqara').at(-1)).toBe('Saqqara')
    // The same day, out to Abu Simbel and back, written both ways round.
    expect(placesNamed('Abu Simbel; Aswan')[0]).not.toBe(placesNamed('Aswan; Abu Simbel')[0])
    // So nothing in the module offers a "the" city.
    const source = readFileSync(join(process.cwd(), 'lib/tours/day-city.ts'), 'utf8')
    expect(source).not.toMatch(/export function (primary|main|first|last|night)\w*City/i)
  })
})

async function priceWithDay2(patch: Record<string, unknown>) {
  const tables = fullRateTables()
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  Object.assign(template.itinerary[1], patch)
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

describe('the engine', () => {
  it('prices the programme as written, to compare against', async () => {
    const result = await priceWithDay2({})
    expect(result.holes.filter(h => h.kind === 'template')).toEqual([])
  })

  it('records ONE gap on the day, naming the places and the way out', async () => {
    const result = await priceWithDay2({ city: 'Cairo; Giza' })
    expect(result.complete).toBe(false)
    const gaps = result.holes.filter(h => h.dayNumber === 2 && h.kind === 'template')
    expect(gaps).toHaveLength(1)
    expect(gaps[0].message).toContain('2 places (Cairo, Giza)')
    expect(gaps[0].message).toMatch(/Tour Manager/)
  })

  it('does not ALSO ask for rates in a city called "Cairo; Giza"', async () => {
    const result = await priceWithDay2({ city: 'Cairo; Giza' })
    const misleading = result.holes.filter(h => h.kind !== 'template' && /;/.test(`${h.city ?? ''} ${h.lookupAttempted} ${h.message}`))
    expect(misleading).toEqual([])
  })

  it('nor invent a road transfer the next day out of the mismatch', async () => {
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    const dayCount = template.itinerary.length
    // Only meaningful when there IS a next day in the fixture.
    expect(dayCount).toBeGreaterThan(2)
    const result = await priceWithDay2({ city: 'Cairo; Giza' })
    const phantom = result.holes.filter(h => h.kind === 'transport' && h.dayNumber === 3 && /^intercity/.test(h.lookupAttempted))
    expect(phantom).toEqual([])
  })

  it('lists the gap IN its day, like every other gap', async () => {
    const result = await priceWithDay2({ city: 'Cairo; Giza' })
    const line = result.services.find(s => s.dayNumber === 2 && s.unpriced && /cannot be priced as written/.test(s.serviceName))
    expect(line?.issue).toContain('2 places')
    expect(line?.lineTotal).toBe(0)
  })
})

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}

describe('the days sheet', () => {
  const tour = (city: string) => [{
    template_code: 'T2E-008',
    itinerary: [{
      day: 1, title: 'Flight to Luxor and Cruise Embarkation', city, accommodation_type: 'cruise',
      meals: { breakfast: 'included', lunch: 'included', dinner: 'included' },
      attractions: ['Karnak Temple', 'Luxor Temple'],
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
    }],
  }]

  it('takes a day with one city', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(tour('Luxor')), papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('T2E-008')?.[0].city).toBe('Luxor')
  })

  it('refuses a list, by day, with the reason — it is how the 21 arrived', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(tour('Cairo; Luxor')), papa)
    expect(byTemplate.has('T2E-008')).toBe(false)
    expect(refused[0].reason).toContain('"T2E-008" day 1')
    expect(refused[0].reason).toContain('2 places (Cairo, Luxor)')
  })
})

describe('the day editor', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')

  it('will not save a list', () => {
    const addDay = SOURCE.slice(SOURCE.indexOf('const addDay = () => {'), SOURCE.indexOf('const newDay: ItineraryDay'))
    expect(addDay).toMatch(/if \(namesSeveralPlaces\(dayCity\)\) return/)
  })

  it('says why, in red, under the field it is about', () => {
    expect(SOURCE).toMatch(/namesSeveralPlaces\(dayCity\) \? \(\s*<p className="[^"]*text-red-600[^"]*" role="alert">\s*\{severalPlacesReason\(dayCity\)\}/)
  })

  it('flags an imported day in the list, where it is first seen — not only once Edit is pressed', () => {
    const list = SOURCE.slice(SOURCE.indexOf('{/* Added Days List */}'))
    expect(list).toMatch(/namesSeveralPlaces\(day\.city\) && \(\s*<span className="[^"]*text-red-600/)
    expect(list).toMatch(/Press Edit and choose one/)
  })
})
