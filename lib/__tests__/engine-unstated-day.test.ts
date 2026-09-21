// What a day has to SAY before it can be priced — and what a day tour does not.
//
// Three reports from production, in three days, all the same fault from a
// different side: the engine prices what a day asks for, and a day that asks
// for nothing costs nothing.
//
//   20 Sep — nine Sawa day tours COMPLETE at 12.50 per person: the lunch.
//   21 Sep — "Aswan Highlights — Unfinished Obelisk, High Dam & Philae" in the
//            B2B calculator at 12.50, Save as Quote enabled, after the operator
//            had given the day a city as the first gap told them to.
//   21 Sep — the operator's rule, which settles it for day tours:
//            "Overnight at a certain city is used only in packages, but day
//             tours do not require overnight or stays to be priced. However,
//             days which include guiding, entrance fees, transportation, meals
//             and tipping should be calculated correctly, not ignored."
//
// So: a DAY TOUR is sightseeing by definition — guide, vehicle and tips are
// asked for whether or not anybody named an attraction, and there is never a
// night. A PACKAGE day has to say what it is, because there a free day is real.
//
// Found on live data, 2026-09-20. 27 of Sawa Tours' 48 template days were a
// title and a description and nothing else — no city, no sightseeing, no
// night. The engine had nothing to look up, so it recorded no gap, and nine
// full-day tours came out COMPLETE at 12.50 per person: the price of the
// lunch. Only a flag on the template kept that figure off the tours page.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

// The live day, shortened: the title names no place the engine knows, and the
// programme is all in the prose.
const PROSE_DAY = {
  day: 1,
  title: ": Cairo's Treasures",
  description: '08:00 AM — pickup from your hotel. 09:00 AM — the three great pyramids…',
  meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
}

// `tourType` is what production has: Sawa's day tours are tour_type
// 'day_tour', which the engine reads as a day trip — no airport transfers, no
// hotel. Left unset, the fixture is a full package, whose first and last days
// are GIVEN an airport transfer by position.
async function price(itinerary: Array<Record<string, unknown>>, tourType?: string, packageType?: string) {
  const tables = fullRateTables()
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  template.itinerary = itinerary
  if (tourType) template.tour_type = tourType
  template.duration_days = itinerary.length
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
    ...(packageType ? { packageType } : {}),
  } as never)
}

const NO_SERVICES = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }
/** A day of a package that prices and says everything it needs to. */
const STATED = { day: 9, title: 'Philae', city: 'Cairo', accommodation_type: 'hotel', attractions: ['Egyptian Museum'], meals: { breakfast: 'included', lunch: 'none', dinner: 'none' } }
/** `days` as a package: a stated day is appended so the programme is never one day long. */
const inPackage = (...days: Array<Record<string, unknown>>) => price([...days, { ...STATED, day: days.length + 1 }])

type Result = Awaited<ReturnType<typeof price>>
const templateHoles = (r: Result, day?: number) => r.holes.filter(h => h.kind === 'template' && (day === undefined || h.dayNumber === day))
/** Everything the engine ASKED for on a day — priced or not. */
const askedFor = (r: Result, day: number) => new Set([
  ...r.services.filter(s => s.dayNumber === day).map(s => s.serviceType),
  ...r.holes.filter(h => h.dayNumber === day || h.dayNumber === undefined).map(h => h.kind),
])

// ============================================================================
// PACKAGES — a day has to say what it is
// ============================================================================
describe('in a package, a day that is only a description', () => {
  it('is a gap that names the day and the way out', async () => {
    const result = await inPackage(PROSE_DAY)
    expect(result.complete).toBe(false)
    const [hole] = templateHoles(result, 1)
    expect(hole.message).toMatch(/only a description/)
    expect(hole.message).toMatch(/Tour Manager/)
  })

  it('names each such day, not the tour as a whole', async () => {
    const result = await inPackage(PROSE_DAY, { ...PROSE_DAY, day: 2 })
    expect(templateHoles(result).map(h => h.dayNumber)).toEqual([1, 2])
  })

  it('says it once per day — not again as "sightseeing not stated"', async () => {
    expect(templateHoles(await inPackage(PROSE_DAY), 1)).toHaveLength(1)
  })
})

describe('in a package, a day must say whether it has sightseeing', () => {
  // A hotel night in Cairo and nothing else: not "only a description", not a
  // meals-only tour — simply priced as a free day, which nobody had decided.
  const SILENT = { day: 1, title: 'Cairo', city: 'Cairo', accommodation_type: 'hotel', meals: { breakfast: 'included', lunch: 'none', dinner: 'none' } }
  const notStated = (r: Result, day = 1) => templateHoles(r, day).filter(h => /does not say whether it includes sightseeing/.test(h.message))

  it('a day that names no attraction and says nothing is a gap, with both ways out', async () => {
    const [hole] = notStated(await inPackage(SILENT))
    expect(hole.message).toMatch(/pick the attractions it visits, or tick "No guided sightseeing on this day"/)
  })

  it.each([
    ['names an attraction', { attractions: ['Egyptian Museum'] }],
    ['picked a fee', { attraction_ids: ['fee-1'], attractions: ['Egyptian Museum'] }],
    ['says "no guided sightseeing" — a free day is a real day, once it SAYS so', { sightseeing: 'none' }],
    ['carries a services block — an arrival day written on purpose', { services: { ...NO_SERVICES, airport_arrival: true, hotel_checkin: true } }],
    ['says a guide is required', { services: { ...NO_SERVICES, guide_required: true } }],
  ])('is satisfied by a day that %s', async (_label, patch) => {
    expect(notStated(await inPackage({ ...SILENT, ...patch }))).toEqual([])
  })

  it('a word in the TITLE is not a statement', async () => {
    expect(notStated(await inPackage({ ...SILENT, title: 'Valley of the Kings and the Temple of Hatshepsut' }))).toHaveLength(1)
  })

  it('"no guided sightseeing" is a decision — a word in the title does not earn the day a guide anyway', async () => {
    const result = await inPackage({ ...SILENT, title: 'At leisure in the Valley', sightseeing: 'none' })
    expect(askedFor(result, 1).has('entrance')).toBe(false)
    expect(result.services.some(s => s.dayNumber === 1 && s.serviceType === 'guide')).toBe(false)
  })

  it('is listed IN its day, so the calculator shows it and a saved quote carries it', async () => {
    const result = await inPackage(SILENT)
    const line = result.services.find(s => s.dayNumber === 1 && s.unpriced && /cannot be priced as written/.test(s.serviceName))
    expect(line?.issue).toMatch(/does not say whether it includes sightseeing/)
  })
})

describe('a programme that asks for nothing but meals', () => {
  // Sightseeing only, as sold — no airport, no hotel to fall back on — and
  // every day says "none". A tour of free days and lunches is not a product.
  const FREE = { day: 1, city: 'Aswan', title: 'At leisure', sightseeing: 'none', accommodation_type: 'none', meals: { breakfast: 'none', lunch: 'external', dinner: 'none' } }

  it('names every day', async () => {
    const result = await price([FREE, { ...FREE, day: 2 }], undefined, 'tours-only')
    expect(result.complete).toBe(false)
    expect(templateHoles(result).map(h => h.dayNumber)).toEqual([1, 2])
    expect(templateHoles(result)[0].message).toMatch(/a meal is not the price of a tour/)
  })

  it('leaves one empty day alone in a tour that has something to price', async () => {
    expect(templateHoles(await price([{ ...FREE, accommodation_type: 'hotel' }, { ...FREE, day: 2 }], undefined, 'tours-only'))).toEqual([])
  })

  it('a FULL package is not meals-only: its first and last days are given an airport transfer', async () => {
    // Position-based defaults are real priced content, so this rule stays out
    // of the way; whether those defaults are right is a different question.
    expect(templateHoles(await price([FREE, { ...FREE, day: 2 }]))).toEqual([])
  })
})

// ============================================================================
// DAY TOURS — the operator's rule, 2026-09-21
// ============================================================================
describe('a day tour is priced as what it is', () => {
  // Exactly what production stores for Sawa's "Aswan Highlights" day 1, after
  // the operator edited it: a city, "no night", a lunch. No attractions, no
  // services block. It was priced at the lunch.
  const AS_STORED = {
    day: 1, city: 'Cairo', title: "A Day Through Aswan's Granite and Water",
    description: '08:00 AM — Gather… the granite quarries… the High Dam… Philae…',
    meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
    accommodation_type: 'none',
  }

  it('asks for the guide, the vehicle and the tips — nobody had to say "guide required"', async () => {
    const asked = askedFor(await price([AS_STORED], 'day_tour'), 1)
    for (const kind of ['guide', 'transport', 'tipping', 'meal']) {
      expect([...asked].some(k => k === kind || (kind === 'transport' && k === 'transportation') || (kind === 'tipping' && k === 'tips')), kind).toBe(true)
    }
  })

  it('is no longer the price of its lunch', async () => {
    const result = await price([AS_STORED], 'day_tour')
    const priced = result.services.filter(s => !s.unpriced).map(s => s.serviceType)
    expect(priced).toContain('guide')
    expect(priced.filter(t => t !== 'meal').length).toBeGreaterThan(0)
  })

  it('has ONE thing missing, and says which: the attractions, for the entrance fees', async () => {
    const result = await price([AS_STORED], 'day_tour')
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'entrance' && /names no attractions/.test(h.message))
    expect(hole?.dayNumber).toBe(1)
    expect(hole?.message).toMatch(/The guide, the vehicle and the tips do not depend on them/)
    // It used to say they "are" priced — directly above "Tips — no rate".
    expect(hole?.message).not.toMatch(/the tips are(?! worked)/)
    expect(hole?.message).toMatch(/pick the attractions it visits/)
    // Not the package rules: a day tour never has to SAY it has sightseeing.
    expect(templateHoles(result)).toEqual([])
  })

  it('stops asking once the day names what it visits', async () => {
    const result = await price([{ ...AS_STORED, attractions: ['Egyptian Museum'] }], 'day_tour')
    expect(result.holes.filter(h => /names no attractions/.test(h.message))).toEqual([])
    expect(result.services.some(s => s.serviceType === 'entrance' && !s.unpriced)).toBe(true)
  })

  it('never has a night, whatever the day says — three live day tours stored "hotel"', async () => {
    const result = await price([{ ...AS_STORED, accommodation_type: 'hotel', attractions: ['Egyptian Museum'] }], 'day_tour')
    expect(result.services.some(s => s.serviceType === 'accommodation' || s.serviceType === 'cruise')).toBe(false)
    expect(result.holes.some(h => h.kind === 'hotel' || h.kind === 'cruise')).toBe(false)
  })

  it('a services block that says guide = false is a BLANK CELL, not a decision — the guide is still asked for', async () => {
    // Every bool on a days sheet imports as false; nine live Travel2Egypt day
    // tours carry guide_required:false beside their attractions.
    const result = await price([{ ...AS_STORED, services: NO_SERVICES }], 'day_tour')
    expect(result.services.some(s => s.serviceType === 'guide') || result.holes.some(h => h.kind === 'guide')).toBe(true)
  })

  it('a one-day programme is a day tour even if nobody set its type', async () => {
    const result = await price([{ ...AS_STORED, accommodation_type: 'hotel' }], undefined, 'tours-only')
    expect(result.services.some(s => s.serviceType === 'guide') || result.holes.some(h => h.kind === 'guide')).toBe(true)
    expect(result.services.some(s => s.serviceType === 'accommodation')).toBe(false)
  })

  it('a day that is only a description is still a day tour: specific gaps, not "nothing can be priced"', async () => {
    const result = await price([PROSE_DAY], 'day_tour')
    expect(result.complete).toBe(false)
    expect(templateHoles(result)).toEqual([])
    expect(result.holes.some(h => /names no attractions/.test(h.message))).toBe(true)
  })

  it('the editor\'s explicit "No guided sightseeing" is respected — and a day tour of nothing is then not a price', async () => {
    const result = await price([{ ...AS_STORED, sightseeing: 'none' }], 'day_tour')
    expect(result.services.some(s => s.serviceType === 'guide')).toBe(false)
    expect(result.complete).toBe(false)
    expect(templateHoles(result)[0].message).toMatch(/a meal is not the price of a tour/)
  })

  it('"explicitly nothing" is no longer complete at 0.00 — Sawa\'s desert safari', async () => {
    // Whale Valley: a city, a services block with everything off, no sights, an
    // included lunch. It came out COMPLETE at 0.00 with no vehicle on it.
    const result = await price([{ ...AS_STORED, attractions: [], services: NO_SERVICES, meals: { breakfast: 'none', lunch: 'included', dinner: 'none' } }], 'day_tour')
    expect(result.complete).toBe(false)
    expect(askedFor(result, 1).size).toBeGreaterThan(0)
  })
})

describe('packages are unchanged by the day-tour rule', () => {
  it('a package day keeps its night, and is not given a guide it did not ask for', async () => {
    const result = await inPackage({ day: 1, title: 'Arrival', city: 'Cairo', accommodation_type: 'hotel', sightseeing: 'none', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' } })
    expect(result.services.some(s => s.dayNumber === 1 && s.serviceType === 'guide')).toBe(false)
    expect(result.services.some(s => s.serviceType === 'accommodation') || result.holes.some(h => h.kind === 'hotel')).toBe(true)
  })
})
