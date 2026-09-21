// Saving an edited day must not delete what the form does not show.
//
// Found 2026-09-21. The day editor built a brand-new day from its form and put
// it in place of the old one — so pressing Edit and Save on a day that came
// from a days sheet deleted its services block (airport arrival, hotel
// check-in, guide) and its worded attractions. The day before, the operator had
// been asked to press Edit on 21 live days to correct their city; every one of
// them has attractions and a services block.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { applyDayForm, wordedAttractions, type DayForm } from '@/lib/tours/day-edit'
import { sightseeingStatement, sightseeingIsStated, isDayTourProgramme, dayTourNamesNoAttractions } from '@/lib/tours/day-sightseeing'

// One of the 21: Travel2Egypt T2E-NC-08J day 3, as production stores it.
const LIVE_DAY = {
  day: 3, title: 'Flight to Luxor and Cruise Embarkation', city: 'Cairo; Luxor', accommodation_type: 'cruise',
  description: 'Morning flight, embark, Karnak and Luxor temples.',
  meals: { breakfast: 'included', lunch: 'included', dinner: 'included' },
  attractions: ['Karnak Temple', 'Luxor Temple'],
  transport_type: 'flight',
  services: { airport_arrival: true, airport_departure: true, hotel_checkin: false, hotel_checkout: true, guide_required: true },
  some_future_field: { kept: true },
}

// What the form holds after Edit: it loads PICKED attractions only, so none here.
const formFor = (over: Partial<DayForm> = {}): DayForm => ({
  title: LIVE_DAY.title, description: LIVE_DAY.description, meals: { ...LIVE_DAY.meals },
  picked: [], transportType: 'flight', transportRateId: '', city: 'Cairo; Luxor', night: 'cruise',
  cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false, ...over,
})

describe('correcting one field changes one field', () => {
  const saved = applyDayForm(LIVE_DAY, formFor({ city: 'Luxor' }), 3)

  it('the city is corrected', () => expect(saved.city).toBe('Luxor'))

  it('the services block survives — it is not on the form', () => {
    expect(saved.services).toEqual(LIVE_DAY.services)
  })

  it('attractions that arrived as words survive — the form never showed them', () => {
    expect(saved.attractions).toEqual(['Karnak Temple', 'Luxor Temple'])
  })

  it('so does a field the form has never heard of', () => {
    expect(saved.some_future_field).toEqual({ kept: true })
  })

  it('and the day is still a sightseeing day afterwards', () => {
    expect(sightseeingStatement(saved)).toBe('attractions')
  })

  it('nothing else moved', () => {
    expect({ ...saved, city: LIVE_DAY.city }).toEqual(LIVE_DAY)
  })
})

describe('blank means "leave it" — which used to be only a comment', () => {
  it('a blank city keeps the city', () => {
    expect(applyDayForm(LIVE_DAY, formFor({ city: '' }), 3).city).toBe('Cairo; Luxor')
  })
  it('a blank night keeps the night', () => {
    expect(applyDayForm(LIVE_DAY, formFor({ night: '' }), 3).accommodation_type).toBe('cruise')
  })
})

describe('what the form DOES own, it can still remove', () => {
  const picked = { ...LIVE_DAY, attractions: ['Karnak Temple'], attraction_ids: ['fee-karnak'] }

  it('picks that were removed are removed', () => {
    const saved = applyDayForm(picked, formFor({ picked: [] }), 3)
    expect(saved.attractions).toBeUndefined()
    expect(saved.attraction_ids).toBeUndefined()
  })

  it('new picks replace worded attractions — an id is a decision', () => {
    const saved = applyDayForm(LIVE_DAY, formFor({ picked: [{ id: 'fee-karnak', name: 'Karnak Temple' }] }), 3)
    expect(saved.attractions).toEqual(['Karnak Temple'])
    expect(saved.attraction_ids).toEqual(['fee-karnak'])
  })

  it('back to road removes the flight and its ticket', () => {
    const saved = applyDayForm({ ...LIVE_DAY, transport_rate_id: 'r1' }, formFor({ transportType: '' }), 3)
    expect(saved.transport_type).toBeUndefined()
    expect(saved.transport_rate_id).toBeUndefined()
  })

  it('unticking the local transfer, the length and the hotels removes them', () => {
    const before = { ...LIVE_DAY, city_transfer: true, sightseeing_length: 'half_day', property_by_tier: { standard: 'h1' } }
    const saved = applyDayForm(before, formFor(), 3)
    expect(saved.city_transfer).toBeUndefined()
    expect(saved.sightseeing_length).toBeUndefined()
    expect(saved.property_by_tier).toBeUndefined()
  })
})

describe('a new day', () => {
  it('is only what the form says', () => {
    const saved = applyDayForm(null, formFor({ picked: [{ id: 'f1', name: 'Philae Temple' }], city: 'Aswan', night: 'none', transportType: '' }), 1)
    expect(saved).toEqual({
      day: 1, title: LIVE_DAY.title, description: LIVE_DAY.description, meals: LIVE_DAY.meals,
      attractions: ['Philae Temple'], attraction_ids: ['f1'], city: 'Aswan', accommodation_type: 'none',
    })
  })
})

describe('"No guided sightseeing on this day"', () => {
  const bare = { day: 2, title: 'At leisure', description: '', meals: LIVE_DAY.meals, city: 'Luxor', accommodation_type: 'hotel' }

  it('is how a day written in the editor says it has none', () => {
    expect(sightseeingIsStated(bare)).toBe(false)
    const saved = applyDayForm(bare, formFor({ title: 'At leisure', city: 'Luxor', night: 'hotel', transportType: '', noSightseeing: true }), 2)
    expect(saved.sightseeing).toBe('none')
    expect(sightseeingStatement(saved)).toBe('none')
  })

  it('unticking it takes the statement away again', () => {
    const saved = applyDayForm({ ...bare, sightseeing: 'none' }, formFor({ transportType: '', noSightseeing: false }), 2)
    expect(saved.sightseeing).toBeUndefined()
  })

  it('cannot be true of a day that names a sight — the attractions win', () => {
    const withPicks = applyDayForm(bare, formFor({ transportType: '', noSightseeing: true, picked: [{ id: 'f1', name: 'Karnak Temple' }] }), 2)
    expect(withPicks.sightseeing).toBeUndefined()
    const withWords = applyDayForm(LIVE_DAY, formFor({ noSightseeing: true }), 3)
    expect(withWords.sightseeing).toBeUndefined()
    expect(sightseeingStatement(withWords)).toBe('attractions')
  })
})

describe('wordedAttractions — what the form tells the operator it is keeping', () => {
  it('names them for a day with words and no picks', () => {
    expect(wordedAttractions(LIVE_DAY)).toEqual(['Karnak Temple', 'Luxor Temple'])
  })
  it('is empty once the day has picks, or has none at all', () => {
    expect(wordedAttractions({ ...LIVE_DAY, attraction_ids: ['f1'] })).toEqual([])
    expect(wordedAttractions({ day: 1 })).toEqual([])
    expect(wordedAttractions(null)).toEqual([])
  })
})

describe('the rule itself', () => {
  it.each([
    [{ attractions: ['Karnak Temple'] }, 'attractions'],
    [{ attraction_ids: ['f1'] }, 'attractions'],
    [{ services: { guide_required: true } }, 'guided'],
    [{ sightseeing: 'none' }, 'none'],
    [{ services: { guide_required: false, airport_arrival: true } }, 'none'],
    [{}, 'unstated'],
    [{ attractions: [], attraction_ids: [] }, 'unstated'],
    [{ attractions: ['  '] }, 'unstated'],
    [{ title: 'Valley of the Kings' }, 'unstated'],
    [null, 'unstated'],
  ])('%j → %s', (day, expected) => {
    expect(sightseeingStatement(day as never)).toBe(expected)
  })
})

describe('the editor uses it', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')
  const addDay = SOURCE.slice(SOURCE.indexOf('const addDay = () => {'), SOURCE.indexOf('const removeDay = '))

  it('saves ON the existing day, never in place of it', () => {
    expect(addDay).toMatch(/applyDayForm\(existing, \{/)
    expect(addDay).not.toMatch(/const newDay: ItineraryDay = \{\s*\n\s*day:/)
  })

  it('offers the tick, and switches it off when the day names a sight', () => {
    expect(SOURCE).toContain('No guided sightseeing on this day')
    expect(SOURCE).toMatch(/disabled=\{dayAttractions\.length > 0\}/)
  })

  it('says which worded attractions it is keeping', () => {
    expect(SOURCE).toMatch(/This day already names, in words:/)
  })

  it('flags an unstated day in the list, where an imported programme is first seen', () => {
    const list = SOURCE.slice(SOURCE.indexOf('{/* Added Days List */}'))
    expect(list).toMatch(/sightseeingStatement\(day as unknown as Record<string, unknown>\) === 'unstated'/)
  })

  it('loads and resets the tick with the rest of the form', () => {
    expect(SOURCE).toContain("setDayNoSightseeing(day.sightseeing === 'none')")
    expect(SOURCE).toMatch(/setDayNoSightseeing\(false\)\n\s*setDayLength\(''\)/)
  })

  it('both modules stay import-free — the editor is a client component', () => {
    for (const f of ['lib/tours/day-edit.ts', 'lib/tours/day-sightseeing.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect([...src.matchAll(/^import\s/gm)], f).toHaveLength(0)
    }
  })
})

// The operator's rule, 2026-09-21: "Overnight at a certain city is used only in
// packages, but day tours do not require overnight or stays to be priced.
// However, days which include guiding, entrance fees, transportation, meals and
// tipping should be calculated correctly, not ignored."
describe('what counts as a day tour — one test, shared by the engine and the editor', () => {
  it.each([
    ['day_tour', 1, true], ['half_day', 1, true], ['stopover', 1, true],
    ['day_tour', 3, true],          // its type says so, however many days were typed in
    [null, 1, true],                // one day long: it cannot have an overnight either
    ['multi_day', 1, true],
    ['multi_day', 2, false], [null, 5, false], ['package', 8, false], [undefined, 0, false],
  ])('type %s with %i day(s) → %s', (type, days, expected) => {
    expect(isDayTourProgramme(type as never, days as number)).toBe(expected)
  })
})

describe('on a day tour, the one thing a day can still fail to say', () => {
  it('is the names of what it visits', () => {
    expect(dayTourNamesNoAttractions({ title: 'Aswan', city: 'Aswan' })).toBe(true)
    expect(dayTourNamesNoAttractions({ services: { guide_required: true } })).toBe(true)
  })
  it('is answered by naming or picking them', () => {
    expect(dayTourNamesNoAttractions({ attractions: ['Philae Temple'] })).toBe(false)
    expect(dayTourNamesNoAttractions({ attraction_ids: ['f1'] })).toBe(false)
  })
  it('is not asked of a day that says it has no sightseeing', () => {
    expect(dayTourNamesNoAttractions({ sightseeing: 'none' })).toBe(false)
  })
})

describe('the editor asks a day tour the right question', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8')

  it('is told the tour\'s type, and applies the engine\'s own test', () => {
    expect(SOURCE).toContain('tourType={formData.tour_type}')
    expect(SOURCE).toMatch(/const isDayTour = isDayTourProgramme\(tourType, Math\.max\(itinerary\.length, 1\)\)/)
  })

  it('says what is always priced, instead of offering "No guided sightseeing"', () => {
    expect(SOURCE).toMatch(/This is a day tour: its guide, vehicle and tips are always priced, and it has no night\./)
    expect(SOURCE).toMatch(/\$\{isDayTour \? 'hidden' : 'flex'\}/)
  })

  it('flags a day with no attractions for what is actually missing — not the package warning', () => {
    const list = SOURCE.slice(SOURCE.indexOf('{/* Added Days List */}'))
    expect(list).toMatch(/isDayTour && dayTourNamesNoAttractions\(/)
    expect(list).toMatch(/!isDayTour && sightseeingStatement\(/)
  })

  it('the engine uses the same test and the same words', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(engine).toMatch(/const isDayTour = isDayTourProgramme\(t\.tour_type,/)
    expect(engine).toContain('${DAY_TOUR_NO_ATTRACTIONS}')
  })
})
