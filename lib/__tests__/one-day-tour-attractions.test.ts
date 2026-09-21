// The attractions picked on a TOUR are what its one day visits.
//
// Operator, 2026-09-21, with a screenshot of "Aswan Highlights — Unfinished
// Obelisk, High Dam & Philae" open in the Tour Manager: three attractions
// picked, and a report from me saying the tour "names no attractions". The
// engine read only each DAY's attractions, never the tour's "Main Attractions"
// — 14 live one-day tours had them in the one place nothing priced from.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { dayNamesAttractions, inheritsTourAttractions, wordedAttractionsForDay } from '@/lib/tours/day-attractions'
import { parseItinerary } from '@/lib/auto-pricing-service'
import { unresolvedWordings } from '@/lib/pricing/alias-admin'

const ASWAN = ['Unfinished Obelisk', 'Aswan High Dam', 'Philae Temple']
const bare = { day: 1, city: 'Aswan', title: "A Day Through Aswan's Granite and Water", meals: { breakfast: 'none', lunch: 'external', dinner: 'none' } }

describe('the rule', () => {
  it('a one-day tour whose day names nothing takes the tour’s attractions', () => {
    expect(wordedAttractionsForDay(bare, 1, ASWAN)).toEqual(ASWAN)
    expect(inheritsTourAttractions(bare, 1, ASWAN)).toBe(true)
  })
  it('a day that names its own keeps its own — worded or picked', () => {
    expect(wordedAttractionsForDay({ ...bare, attractions: ['Kalabsha Temple'] }, 1, ASWAN)).toEqual(['Kalabsha Temple'])
    const picked = { ...bare, attractions: ['Philae Temple'], attraction_ids: ['fee-9'] }
    expect(wordedAttractionsForDay(picked, 1, ASWAN)).toEqual(['Philae Temple'])
    expect(dayNamesAttractions({ attraction_ids: ['fee-9'] })).toBe(true)
  })
  it('"No guided sightseeing on this day" wins', () => {
    expect(wordedAttractionsForDay({ ...bare, sightseeing: 'none' }, 1, ASWAN)).toEqual([])
  })
  it('a MULTI-day tour’s attractions are not dealt out to its days — which day visits what is not said', () => {
    expect(wordedAttractionsForDay(bare, 2, ASWAN)).toEqual([])
    expect(wordedAttractionsForDay(bare, 12, ASWAN)).toEqual([])
  })
  it('blanks and repeats are dropped; junk is nothing', () => {
    expect(wordedAttractionsForDay(bare, 1, ['Philae Temple', ' ', 'Philae Temple', 7, null])).toEqual(['Philae Temple'])
    expect(wordedAttractionsForDay(bare, 1, null)).toEqual([])
    expect(wordedAttractionsForDay(bare, 1, 'Philae')).toEqual([])
  })
})

describe('the engine', () => {
  it('prices the Aswan day for the three attractions picked on the tour', () => {
    const [day] = parseItinerary([bare], { dayTour: true, tourAttractions: ASWAN })
    expect(day.attractions).toEqual(ASWAN)
    expect(day.dayTourWithoutAttractions, 'and no longer says it names none').toBe(false)
    expect(day.services.guide_required).toBe(true)
    expect(day.accommodation_type).toBe('none')
  })
  it('still says so when neither the day nor the tour names any', () => {
    const [day] = parseItinerary([bare], { dayTour: true, tourAttractions: [] })
    expect(day.dayTourWithoutAttractions).toBe(true)
  })
  it('a package day is untouched by the tour’s list', () => {
    const days = parseItinerary([{ ...bare, day: 1 }, { ...bare, day: 2 }], { tourAttractions: ASWAN })
    expect(days.map(d => d.attractions)).toEqual([[], []])
    expect(days[0].sightseeingUnstated).toBe(true)
  })
  it('reads main_attractions with the tour, and hands it to the parser', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(engine).toMatch(/tour_type,\s+main_attractions,\s+itinerary/)
    expect(engine).toContain('tourAttractions: t.main_attractions')
  })
})

describe('Settings → Attraction names sees the same wording the engine prices', () => {
  const fees = [{ attraction_name: 'Unfinished Obelisk' }, { attraction_name: 'Philae Temple' }]
  it('a one-day tour’s tour-level wording with no fee is listed', () => {
    const found = unresolvedWordings([{ template_name: 'Aswan Highlights', itinerary: [bare], main_attractions: ASWAN }], [], fees)
    expect(found.map(f => f.wording)).toEqual(['Aswan High Dam'])
  })
  it('a multi-day tour’s tour-level wording is not', () => {
    expect(unresolvedWordings([{ template_name: 'Two days', itinerary: [bare, bare], main_attractions: ASWAN }], [], fees)).toEqual([])
  })
  it('the route reads main_attractions for the scan', () => {
    expect(readFileSync(join(process.cwd(), 'app/api/attraction-aliases/route.ts'), 'utf8')).toContain("select('template_name, itinerary, main_attractions')")
  })
})

describe('the Tour Manager says where Main Attractions are priced', () => {
  const page = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
  it('for a one-day tour and for a longer one', () => {
    expect(page).toContain('On a one-day tour these are the entrance fees the day is priced for')
    expect(page).toContain('These describe the tour. Entrance fees are priced from each DAY')
  })
})
