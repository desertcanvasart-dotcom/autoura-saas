// A day's TITLE is marketing wording. It is not a list of tickets, and it is
// not an instruction to send a guide.
//
// Until 2026-09-21 the engine read both out of it. A title containing
// "temple", "pyramid", "museum", "valley" or "tomb" earned the day a guide;
// and when the day named no attractions, the title was searched for twenty
// sight names and an entrance fee was charged for each one found:
//
//   - "Memphis, Saqqara & Dahshur — Birth of the Pyramid" bought a GIZA ticket;
//   - any title with the letters "gem" ("Hidden Gems of Old Cairo") bought the
//     Grand Egyptian Museum;
//   - two live Sawa Tours day tours that name NO attraction — "South to Abu
//     Simbel and Back" and "Kom Ombo, Edfu & Esna" — escaped the "names no
//     attractions" gap that eleven others like them were given.
//
// Measured on production before the change: 6 of 45 live tours priced
// differently, every affected day already carried (or now carries) a gap, and
// no tour went from complete to incomplete — none was complete.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseItinerary } from '@/lib/auto-pricing-service'

const day = (over: Record<string, unknown>) => ({ day: 1, meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, ...over })

describe('the title names no attractions', () => {
  it.each([
    ['Memphis, Saqqara & Dahshur — Birth of the Pyramid'],
    ['Hidden Gems of Old Cairo'],
    ['South to Abu Simbel and Back'],
    ['Karnak, Luxor Temple and the Valley of the Kings'],
    ['The Egyptian Museum, the Citadel and Khan el-Khalili'],
  ])('"%s" → none', (title) => {
    const [parsed] = parseItinerary([day({ title, city: 'Cairo' })])
    expect(parsed.attractions).toEqual([])
    expect(parsed.attraction_ids).toEqual([])
  })

  it('the attractions a day STORES are the ones it has — all of them, and only them', () => {
    const [parsed] = parseItinerary([day({ title: 'Pyramids and Sphinx', city: 'Cairo', attractions: ['Saqqara', '  ', 'Dahshur'] })])
    expect(parsed.attractions).toEqual(['Saqqara', 'Dahshur'])
  })
})

describe('the title sends no guide', () => {
  it('a package day whose title says "Temple" is not guided by that word', () => {
    const [, middle] = parseItinerary([
      day({ day: 1, title: 'Arrival in Luxor', city: 'Luxor' }),
      day({ day: 2, title: 'Temples, Tombs and the Valley', city: 'Luxor' }),
      day({ day: 3, title: 'Departure', city: 'Luxor' }),
    ])
    expect(middle.services.guide_required).toBe(false)
    // …and it is not quietly a free day either: it has not SAID what it is.
    expect(middle.sightseeingUnstated).toBe(true)
  })

  it('attractions picked from the fee sheet (ids) do send one', () => {
    const [parsed] = parseItinerary([
      day({ title: 'A day out', city: 'Luxor', attractions: ['Karnak Temple'], attraction_ids: ['fee-1'] }),
      day({ day: 2, title: 'Departure', city: 'Luxor' }),
    ])
    expect(parsed.services.guide_required).toBe(true)
    expect(parsed.sightseeingUnstated).toBe(false)
  })

  it('a stored services block is still obeyed — the title cannot overrule it', () => {
    const [parsed] = parseItinerary([
      day({ title: 'Valley of the Kings at leisure', city: 'Luxor', services: { guide_required: false } }),
      day({ day: 2, title: 'Departure', city: 'Luxor' }),
    ])
    expect(parsed.services.guide_required).toBe(false)
  })
})

describe('a day tour that names no attraction says so — whatever its title', () => {
  it.each([
    ['South to Abu Simbel and Back'],
    ['Kom Ombo, Edfu & Esna — Downriver from Aswan to Luxor'],
    ['A Day Through Aswan\'s Granite and Water'],
  ])('"%s"', (title) => {
    const [parsed] = parseItinerary([day({ title, city: 'Aswan', meals: { breakfast: 'none', lunch: 'external', dinner: 'none' } })], { dayTour: true })
    expect(parsed.dayTourWithoutAttractions).toBe(true)
    // Your day-tour rule still holds: it is guided, and it has no night.
    expect(parsed.services.guide_required).toBe(true)
    expect(parsed.accommodation_type).toBe('none')
  })

  it('"No guided sightseeing on this day" is still a decision, not a gap', () => {
    const [parsed] = parseItinerary([day({ title: 'Pyramids at your own pace', city: 'Cairo', sightseeing: 'none' })], { dayTour: true })
    expect(parsed.dayTourWithoutAttractions).toBe(false)
    expect(parsed.attractions).toEqual([])
  })
})

describe('it cannot come back', () => {
  const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
  it('the title search and its name table are gone', () => {
    expect(engine).not.toMatch(/extractAttractionsFromTitle|normalizeAttractionName/)
  })
  it('no sightseeing keyword is tested against a title', () => {
    expect(engine).not.toMatch(/temple\|pyramid\|museum/i)
  })
})
