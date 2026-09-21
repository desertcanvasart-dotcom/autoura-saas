import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import {
  serializeDaysCsv, parseDaysCsv, sampleDaysCsv, toItineraryDay, DAY_CSV_COLUMNS,
} from '@/lib/tours/itinerary-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}

// ============================================================================
// A tour's itinerary could not ride the template sheet — a day is a nested
// record and a flat row cannot hold one — so an imported tour arrived with its
// day-by-day narrative in Long Description and NO day structure, which is what
// nights, meals and transport are counted from. The days get their own sheet.
// ============================================================================

const twoDayTour = [{
  template_code: 'CAI-001',
  itinerary: [
    { day: 1, title: 'Arrival', city: 'Cairo', accommodation_type: 'hotel',
      meals: { breakfast: 'none', lunch: 'none', dinner: 'included' },
      attractions: ['Khan el-Khalili'],
      services: { airport_arrival: true, airport_departure: false, hotel_checkin: true, hotel_checkout: false, guide_required: true } },
    { day: 2, title: 'Luxor', city: 'Luxor', accommodation_type: 'hotel',
      transport_type: 'flight',
      meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
      attractions: ['Karnak Temple'],
      services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true } },
  ],
}]

describe('a day survives the round trip', () => {
  it('writes one row per day', () => {
    const lines = serializeDaysCsv(twoDayTour).trim().split('\n')
    expect(lines).toHaveLength(3) // header + 2 days
    expect(lines[0]).toBe(DAY_CSV_COLUMNS.map(c => c.label).join(','))
  })

  it('comes back in the shape the itinerary stores', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(twoDayTour), papa)
    expect(refused).toEqual([])
    const days = byTemplate.get('CAI-001')!
    expect(days).toHaveLength(2)
    expect(days[0]).toMatchObject({
      day: 1, title: 'Arrival', city: 'Cairo', accommodation_type: 'hotel',
      meals: { breakfast: 'none', lunch: 'none', dinner: 'included' },
      attractions: ['Khan el-Khalili'],
      services: { airport_arrival: true, hotel_checkin: true, guide_required: true },
    })
  })

  it('keeps a flight day a flight day', () => {
    const { byTemplate } = parseDaysCsv(serializeDaysCsv(twoDayTour), papa)
    expect(byTemplate.get('CAI-001')![1].transport_type).toBe('flight')
  })

  it('leaves a road day with no transport_type at all', () => {
    // Absent has always meant road. Writing 'road' would introduce a value the
    // day editor never sets, so a re-read would differ from what the UI saves.
    const { byTemplate } = parseDaysCsv(serializeDaysCsv(twoDayTour), papa)
    expect(byTemplate.get('CAI-001')![0]).not.toHaveProperty('transport_type')
  })
})

describe('a sheet replaces an itinerary, so it must be whole', () => {
  // Every row states all three meals, because the sheet refuses one that does
  // not — that rule is tested on its own below.
  const sheet = (rows: string[]) =>
    ['Template Code,Day,Title,City,Breakfast,Lunch,Dinner', ...rows.map(r => r + ',none,none,none')].join('\n') + '\n'

  it('refuses a gap rather than deleting the day it skips', () => {
    // Days 1 and 3 of a 3-day tour: writing this would silently drop day 2.
    const { byTemplate, refused } = parseDaysCsv(sheet(['CAI-1,1,A,Cairo', 'CAI-1,3,C,Luxor']), papa)
    expect(byTemplate.size).toBe(0)
    expect(refused[0].reason).toContain('no gaps or repeats')
    expect(refused[0].reason).toContain('would delete')
  })

  it('refuses a repeated day number', () => {
    const { refused } = parseDaysCsv(sheet(['CAI-1,1,A,Cairo', 'CAI-1,1,B,Giza']), papa)
    expect(refused[0].reason).toContain('no gaps or repeats')
  })

  it('accepts days given out of order', () => {
    // The rows may be in any order; it is the SET that must be 1..N.
    const { byTemplate, refused } = parseDaysCsv(sheet(['CAI-1,2,B,Luxor', 'CAI-1,1,A,Cairo']), papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('CAI-1')!.map(d => d.day)).toEqual([1, 2])
  })

  it('refuses one tour without taking the others down with it', () => {
    const { byTemplate, refused } = parseDaysCsv(
      sheet(['GOOD,1,A,Cairo', 'BAD,2,B,Luxor']), papa)
    expect(byTemplate.has('GOOD')).toBe(true)
    expect(byTemplate.has('BAD')).toBe(false)
    expect(refused).toHaveLength(1)
  })
})

describe('values the engine prices from are checked, not stored blindly', () => {
  it('refuses a meal status that is not one of the three', () => {
    const csv = 'Template Code,Day,Breakfast\nCAI-1,1,maybe\n'
    const { refused, byTemplate } = parseDaysCsv(csv, papa)
    expect(byTemplate.size).toBe(0)
    expect(refused[0].reason).toContain('included, external, none')
  })

  it('refuses an unknown travel mode', () => {
    const csv = 'Template Code,Day,Transport\nCAI-1,1,teleport\n'
    expect(parseDaysCsv(csv, papa).refused[0].reason).toContain('sleeping_train')
  })

  it('accepts an external breakfast — a restaurant breakfast is a real cost', () => {
    const csv = 'Template Code,Day,Breakfast,Lunch,Dinner\nCAI-1,1,external,none,none\n'
    const { byTemplate, refused } = parseDaysCsv(csv, papa)
    expect(refused).toEqual([])
    expect((byTemplate.get('CAI-1')![0].meals as { breakfast: string }).breakfast).toBe('external')
  })

  it('refuses a day that leaves a meal unstated — a blank is not "none"', () => {
    // THE RULE: hotel, restaurant, or none — stated, for every meal, every
    // day. An itinerary that has not said where lunch is, is badly written,
    // and a cost line is never inferred.
    const csv = 'Template Code,Day,Breakfast,Dinner\nCAI-1,1,included,none\n'
    const { byTemplate, refused } = parseDaysCsv(csv, papa)
    expect(byTemplate.size).toBe(0)
    expect(refused[0].reason).toContain('Lunch is not stated')
  })

  it('is case-insensitive about the ones it accepts', () => {
    const csv = 'Template Code,Day,Accommodation,Breakfast,Lunch,Dinner\nCAI-1,1,HOTEL,Included,none,none\n'
    const { byTemplate, refused } = parseDaysCsv(csv, papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('CAI-1')![0].accommodation_type).toBe('hotel')
  })
})

describe('the same guards as the template sheet', () => {
  it('reports a header with no Template Code as a file problem', () => {
    const { headerError, refused } = parseDaysCsv('Reference,Number\nX,1\n', papa)
    expect(headerError).toContain('Template Code')
    expect(refused).toEqual([])
  })

  it('counts the sample rows it skips', () => {
    const r = parseDaysCsv(sampleDaysCsv(), papa)
    expect(r.byTemplate.size).toBe(0)
    expect(r.exampleRows).toBe(1)
  })

  it('names columns it does not read', () => {
    const csv = 'Template Code,Day,Weather\nCAI-1,1,sunny\n'
    expect(parseDaysCsv(csv, papa).ignoredHeaders).toEqual(['Weather'])
  })

  it('names the row when a Template Code cell is blank', () => {
    const csv = 'Template Code,Day\n,1\n'
    expect(parseDaysCsv(csv, papa).refused[0].reason).toContain('row 2')
  })
})

describe('toItineraryDay fills what the engine reads', () => {
  it('defaults every meal and service rather than leaving them undefined', () => {
    const d = toItineraryDay({ day: 1 })
    expect(d.meals).toEqual({ breakfast: 'none', lunch: 'none', dinner: 'none' })
    expect(d.services).toMatchObject({ guide_required: false, hotel_checkin: false })
    expect(d.attractions).toEqual([])
  })

  it('leaves an unstated NIGHT unstated — "no night" is a different claim', () => {
    // It used to store 'none' for a blank cell, which says the day has no bed
    // and silently removes the hotel from pricing. Unset means the day does
    // not say, and the engine infers it as it always has.
    expect(toItineraryDay({ day: 1 }).accommodation_type).toBeUndefined()
    expect(toItineraryDay({ day: 1, accommodation_type: '' }).accommodation_type).toBeUndefined()
    expect(toItineraryDay({ day: 1, accommodation_type: 'none' }).accommodation_type).toBe('none')
    expect(toItineraryDay({ day: 1, accommodation_type: 'cruise' }).accommodation_type).toBe('cruise')
  })
})

// ============================================================================
// A day must SAY whether it has sightseeing (lib/tours/day-sightseeing.ts).
//
// Every bool on this sheet exports as "false" and a blank imports as false, so
// a round trip used to turn a day nobody had described into a day that "says"
// it has no guide — and the gap the engine records for it quietly went away.
// The Sightseeing column carries the statement instead of inventing it.
// ============================================================================
describe('the sightseeing statement rides the sheet', () => {
  const base = { meals: { breakfast: 'none', lunch: 'none', dinner: 'none' } }
  const tour = (...days: Array<Record<string, unknown>>) => [{ template_code: 'SAW-010', itinerary: days.map((d, i) => ({ day: i + 1, title: `Day ${i + 1}`, ...base, ...d })) }]
  const cell = (csv: string, row: number, label: string) => {
    const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    return p.data[row][label]
  }

  it('has the column', () => {
    expect(DAY_CSV_COLUMNS.map(c => c.name)).toContain('sightseeing')
  })

  it('exports "none" for a day that says so — the editor\'s tick, or an arrival day\'s services block', () => {
    const csv = serializeDaysCsv(tour(
      { sightseeing: 'none' },
      { services: { airport_arrival: true, airport_departure: false, hotel_checkin: true, hotel_checkout: false, guide_required: false } },
    ))
    expect(cell(csv, 0, 'Sightseeing')).toBe('none')
    expect(cell(csv, 1, 'Sightseeing')).toBe('none')
  })

  it('exports a blank for a day whose attractions or guide already say it', () => {
    const csv = serializeDaysCsv(tour({ attractions: ['Philae Temple'] }, { services: { guide_required: true } }))
    expect(cell(csv, 0, 'Sightseeing')).toBe('')
    expect(cell(csv, 1, 'Sightseeing')).toBe('')
  })

  it('exports a blank for a day that says NOTHING — and does not invent the answer', () => {
    expect(cell(serializeDaysCsv(tour({ city: 'Aswan' })), 0, 'Sightseeing')).toBe('')
  })

  it('"none" survives the round trip', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(tour({ sightseeing: 'none', city: 'Luxor' })), papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('SAW-010')?.[0].sightseeing).toBe('none')
  })

  it('a day that says nothing is REFUSED on the way back in, by day, with the three ways out', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(tour({ city: 'Aswan' })), papa)
    expect(byTemplate.has('SAW-010')).toBe(false)
    expect(refused[0].reason).toContain('"SAW-010" day 1')
    expect(refused[0].reason).toMatch(/does not say whether it includes sightseeing/)
    expect(refused[0].reason).toMatch(/List its Attractions, set Guide to true, or put "none" in Sightseeing/)
  })

  it('"none" on a day that lists attractions, or asks for a guide, is refused — it cannot be both', () => {
    const header = DAY_CSV_COLUMNS.map(c => c.label).join(',')
    const row = (over: Record<string, string>) => DAY_CSV_COLUMNS.map(c => `"${({ template_code: 'SAW-010', day: '1', title: 'Day 1', breakfast: 'none', lunch: 'none', dinner: 'none', sightseeing: 'none', ...over } as Record<string, string>)[c.name] ?? ''}"`).join(',')
    const both = parseDaysCsv(`${header}\n${row({ attractions: 'Philae Temple' })}\n`, papa)
    expect(both.refused[0].reason).toMatch(/lists attractions — it cannot be both/)
    const guided = parseDaysCsv(`${header}\n${row({ guide_required: 'true' })}\n`, papa)
    expect(guided.refused[0].reason).toMatch(/asks for a guide — it cannot be both/)
  })

  it('a sheet made BEFORE the column existed imports exactly as it did', () => {
    const old = DAY_CSV_COLUMNS.filter(c => c.name !== 'sightseeing')
    const header = old.map(c => c.label).join(',')
    const row = old.map(c => `"${({ template_code: 'SAW-010', day: '1', title: 'Arrival', breakfast: 'none', lunch: 'none', dinner: 'none' } as Record<string, string>)[c.name] ?? ''}"`).join(',')
    const { byTemplate, refused } = parseDaysCsv(`${header}\n${row}\n`, papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('SAW-010')).toHaveLength(1)
  })

  it('the sample sheet passes its own rule', () => {
    const { refused } = parseDaysCsv(sampleDaysCsv().replace(/EXAMPLE-REPLACE-THIS-CODE/g, 'REAL-001'), papa)
    expect(refused).toEqual([])
  })
})
