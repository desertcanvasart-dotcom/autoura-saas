// A day that says nothing is not a day that costs nothing.
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

describe('a day that is only a description', () => {
  it('is a gap, so a tour made of one is not a price', async () => {
    const result = await price([PROSE_DAY])
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'template')
    expect(hole?.dayNumber).toBe(1)
    expect(hole?.message).toMatch(/only a description/)
    expect(hole?.message).toMatch(/Tour Manager/)
  })

  it('names each such day, not the tour as a whole', async () => {
    const result = await price([PROSE_DAY, { ...PROSE_DAY, day: 2 }])
    expect(result.holes.filter(h => h.kind === 'template').map(h => h.dayNumber)).toEqual([1, 2])
  })
})

describe('a day that says something is left alone', () => {
  const templateHoles = async (day: Record<string, unknown>) =>
    (await price([day])).holes.filter(h => h.kind === 'template')

  it('a city is enough IN A TOUR THAT HAS SOMETHING ELSE TO PRICE — a free day is a real day', async () => {
    // Day 1 has a hotel night, so the tour is more than its meals; day 2 is a
    // day at leisure and is left alone. (On its own this day is NOT enough —
    // see "a tour that asks for nothing but meals", below. It used to be, and
    // that is how a one-day tour reached the calculator priced at its lunch.)
    const result = await price([
      { ...PROSE_DAY, city: 'Cairo', accommodation_type: 'hotel', sightseeing: 'none' },
      { ...PROSE_DAY, day: 2, city: 'Cairo', sightseeing: 'none' },
    ])
    expect(result.holes.filter(h => h.kind === 'template')).toEqual([])
  })

  it('a stated services object is not "only a description" — it is judged by the rule below instead', async () => {
    const holes = await templateHoles({
      ...PROSE_DAY,
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
    })
    expect(holes.some(h => /only a description/.test(h.message))).toBe(false)
  })

  it('a title the engine can read a visit from is not "only a description" — but it is not a STATEMENT either', async () => {
    // The old title fallback still earns the day a guide; whether to keep
    // reading titles is the operator's open question. What changed is that a
    // word in a title no longer counts as the day having said anything: it is
    // asked to say so (see "a day must say whether it has sightseeing").
    const holes = await templateHoles({ ...PROSE_DAY, title: 'Giza Pyramids and the Egyptian Museum' })
    expect(holes.some(h => /only a description/.test(h.message))).toBe(false)
    expect(holes.some(h => /does not say whether it includes sightseeing/.test(h.message))).toBe(true)
  })
})

// ============================================================================
// Reported from production, 2026-09-21. Sawa Tours' "Aswan Highlights —
// Unfinished Obelisk, High Dam & Philae" in the B2B calculator: 12.50 per
// person, ONE line in the breakdown (Lunch), no gap, Save as Quote enabled.
//
// The guard above had told the operator to fill in the day. They gave it a city
// and "no night" — and a day with just a city was let through on purpose, as a
// possible free day. It is one, when the rest of the tour has something to
// price. When nothing in the programme asks for a sight, a guide, a night, a
// transfer or a journey, the whole price is the meals.
// ============================================================================
describe('a tour that asks for nothing but meals', () => {
  // The live day as the operator left it after editing — plus the one thing
  // that day did not have: a statement about sightseeing. WITHOUT it the day is
  // caught earlier, by "a day must say whether it has sightseeing" (below);
  // WITH "none" it is this rule's case — a tour of free days and lunches.
  const ASWAN = {
    sightseeing: 'none',
    day: 1,
    city: 'Aswan',
    title: "A Day Through Aswan's Granite and Water",
    description: '08:00 AM — Gather in Aswan… the northern granite quarries… the High Dam… Philae…',
    meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
    accommodation_type: 'none',
  }

  it('is not a price — the production case', async () => {
    const result = await price([ASWAN], 'day_tour')
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'template')
    expect(hole?.dayNumber).toBe(1)
    expect(hole?.message).toContain('(Aswan)')
    expect(hole?.message).toMatch(/no sights, no guide, no transport, no night/)
    expect(hole?.message).toMatch(/pick the attractions it visits/)
  })

  it('is listed IN its day, so the calculator shows it and a saved quote carries it', async () => {
    const result = await price([ASWAN], 'day_tour')
    const line = result.services.find(s => s.dayNumber === 1 && s.unpriced && /cannot be priced as written/.test(s.serviceName))
    expect(line?.issue).toMatch(/a meal is not the price of a tour/)
  })

  it('stops being one the moment the day says what it visits', async () => {
    const result = await price([{ ...ASWAN, attractions: ['Philae Temple'] }], 'day_tour')
    expect(result.holes.filter(h => h.kind === 'template')).toEqual([])
    // …and the sights bring the rest with them: something beyond lunch is asked for.
    const asked = new Set([...result.services.map(s => s.serviceType), ...result.holes.map(h => h.kind)])
    expect([...asked].some(k => k !== 'meal')).toBe(true)
  })

  it('"explicitly nothing" is still nothing — a desert safari with no vehicle priced at 0', async () => {
    // Sawa's Whale Valley day: a city, services all switched off, no sights, a
    // lunch that is included. It came out COMPLETE at 0.00.
    const result = await price([{
      ...ASWAN, city: 'Fayoum', attractions: [],
      meals: { breakfast: 'none', lunch: 'included', dinner: 'none' },
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
    }], 'day_tour')
    expect(result.complete).toBe(false)
    expect(result.holes.some(h => h.kind === 'template')).toBe(true)
  })

  it('names every day when a whole multi-day programme is like that', async () => {
    // Sightseeing only, as sold: no airport, no hotel to fall back on.
    const result = await price([ASWAN, { ...ASWAN, day: 2 }], undefined, 'tours-only')
    expect(result.holes.filter(h => h.kind === 'template').map(h => h.dayNumber)).toEqual([1, 2])
  })

  it('leaves one empty day alone in a tour that has something to price', async () => {
    // A departure day with nothing on it, after a night in a hotel.
    const result = await price([{ ...ASWAN, accommodation_type: 'hotel' }, { ...ASWAN, day: 2 }])
    expect(result.holes.filter(h => h.kind === 'template')).toEqual([])
  })

  it('a FULL package is not meals-only: its first and last days are given an airport transfer', async () => {
    // Position-based defaults are real priced content, so this rule stays out
    // of the way; whether those defaults are right is a different question.
    const result = await price([ASWAN, { ...ASWAN, day: 2 }])
    expect(result.holes.filter(h => h.kind === 'template')).toEqual([])
  })

  it('does not say it twice for a day that is only a description', async () => {
    const result = await price([PROSE_DAY], 'day_tour')
    expect(result.holes.filter(h => h.kind === 'template')).toHaveLength(1)
  })
})

// ============================================================================
// A DAY MUST SAY WHETHER IT HAS SIGHTSEEING.
//
// Everything a sightseeing day costs — entrance fees, guide, vehicle, tips —
// follows from its attractions. A day that named none and said nothing was
// priced as a free day without anyone deciding that. On production, 28 of Sawa
// Tours' 48 days and 3 of Travel2Egypt's 40. The operator's rule for meals,
// applied here: a blank is not "none".
// ============================================================================
describe('a day must say whether it has sightseeing', () => {
  // Exactly what production stores for "Aswan Highlights" day 1.
  const AS_STORED = {
    day: 1, city: 'Aswan', title: "A Day Through Aswan's Granite and Water",
    description: '08:00 AM — Gather in Aswan…',
    meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
    accommodation_type: 'none',
  }
  const sightseeingHoles = (r: Awaited<ReturnType<typeof price>>) =>
    r.holes.filter(h => /does not say whether it includes sightseeing/.test(h.message))

  it('a day that names no attraction and says nothing is a gap — the production day', async () => {
    const result = await price([AS_STORED], 'day_tour')
    expect(result.complete).toBe(false)
    const [hole] = sightseeingHoles(result)
    expect(hole.dayNumber).toBe(1)
    expect(hole.message).toMatch(/pick the attractions it visits, or tick "No guided sightseeing on this day"/)
    // One reason per day, the most specific: not ALSO the meals-only one.
    expect(result.holes.filter(h => h.kind === 'template')).toHaveLength(1)
  })

  it('it matters most INSIDE a package, where nothing else would have noticed', async () => {
    // Day 2 has a hotel night, so the tour is not "meals only" and the day is
    // not "only a description". It was simply priced as a free day.
    const result = await price([
      { ...AS_STORED, accommodation_type: 'hotel', attractions: ['Philae Temple'] },
      { ...AS_STORED, day: 2, accommodation_type: 'hotel', title: 'Luxor' },
    ])
    expect(sightseeingHoles(result).map(h => h.dayNumber)).toEqual([2])
  })

  it.each([
    ['names an attraction', { attractions: ['Philae Temple'] }],
    ['picked a fee', { attraction_ids: ['fee-1'], attractions: ['Philae Temple'] }],
    ['says "no guided sightseeing"', { sightseeing: 'none' }],
    ['carries a services block — an arrival day written on purpose', { services: { airport_arrival: true, airport_departure: false, hotel_checkin: true, hotel_checkout: false, guide_required: false } }],
    ['says a guide is required', { services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true } }],
  ])('is satisfied by a day that %s', async (_label, patch) => {
    expect(sightseeingHoles(await price([{ ...AS_STORED, ...patch }], 'day_tour'))).toEqual([])
  })

  it('a word in the TITLE is not a statement', async () => {
    const result = await price([{ ...AS_STORED, title: 'Valley of the Kings and the Temple of Hatshepsut' }], 'day_tour')
    expect(sightseeingHoles(result)).toHaveLength(1)
  })

  it('"no guided sightseeing" is a decision — a word in the title does not earn the day a guide anyway', async () => {
    const result = await price([
      { ...AS_STORED, accommodation_type: 'hotel', attractions: ['Philae Temple'] },
      { ...AS_STORED, day: 2, accommodation_type: 'hotel', title: 'At leisure in the Valley', sightseeing: 'none' },
    ])
    const day2 = result.services.filter(s => s.dayNumber === 2).map(s => s.serviceType)
    expect(day2).not.toContain('guide')
    expect(day2).not.toContain('entrance')
    expect(result.holes.filter(h => h.dayNumber === 2 && (h.kind === 'guide' || h.kind === 'entrance'))).toEqual([])
  })

  it('is listed IN its day, so the calculator shows it and a saved quote carries it', async () => {
    const result = await price([AS_STORED], 'day_tour')
    const line = result.services.find(s => s.dayNumber === 1 && s.unpriced && /cannot be priced as written/.test(s.serviceName))
    expect(line?.issue).toMatch(/does not say whether it includes sightseeing/)
  })
})
