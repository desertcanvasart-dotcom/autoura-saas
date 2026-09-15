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
  const sheet = (rows: string[]) =>
    ['Template Code,Day,Title,City', ...rows].join('\n') + '\n'

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

  it('refuses an external breakfast, which the engine could not price', () => {
    // Lunch and dinner have an external (restaurant) pricing block; breakfast
    // does not — it is assumed to travel with the hotel. Storing it would be
    // a meal that is silently never priced.
    const csv = 'Template Code,Day,Breakfast\nCAI-1,1,external\n'
    const { byTemplate, refused } = parseDaysCsv(csv, papa)
    expect(byTemplate.size).toBe(0)
    expect(refused[0].reason).toContain('hotel rate')
  })

  it('accepts an external lunch, which the engine prices from meal rates', () => {
    const csv = 'Template Code,Day,Lunch\nCAI-1,1,external\n'
    const { byTemplate, refused } = parseDaysCsv(csv, papa)
    expect(refused).toEqual([])
    expect((byTemplate.get('CAI-1')![0].meals as { lunch: string }).lunch).toBe('external')
  })

  it('is case-insensitive about the ones it accepts', () => {
    const csv = 'Template Code,Day,Accommodation,Breakfast\nCAI-1,1,HOTEL,Included\n'
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
    expect(r.exampleRows).toBe(2)
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
    expect(d.accommodation_type).toBe('none')
    expect(d.attractions).toEqual([])
  })
})
