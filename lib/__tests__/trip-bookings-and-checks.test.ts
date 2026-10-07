import { describe, it, expect } from 'vitest'
import { bookingKind, dayBookings, includesFromLines } from '@/lib/itineraries/day-bookings'
import { hotelRateIdOf, nightFromBooking, tripChecks, tripStays, type CheckDay } from '@/lib/itineraries/trip-checks'
import { dayReturnsTo } from '@/lib/itineraries/overnight-city'

const MENA = '11111111-1111-4111-8111-111111111111'
const ALEX_HOTEL = '22222222-2222-4222-8222-222222222222'

// Lines as each path saves them.
const gridHotel = (id: string, rateId = MENA) => ({
  id, service_type: 'accommodation', service_name: 'Mena House Cairo (standard | BB)',
  description: '[pricing-grid:accommodation] Mena House', rate_table: 'accommodation_rates', rate_id: rateId,
})
const aiHotel = (id: string, rateId = MENA) => ({
  id, service_type: 'accommodation', service_name: 'Mena House', supplier_name: 'Mena House', service_code: rateId,
})
const line = (id: string, service_type: string, service_name: string, description: string | null = null) =>
  ({ id, service_type, service_name, description })

describe('what a line books', () => {
  it('reads the grid tag, else the type', () => {
    expect(bookingKind(gridHotel('a'))).toBe('hotel')
    expect(bookingKind(line('b', 'accommodation', 'Al Farida (3N, cabin)', '[pricing-grid:cruise] Al Farida'))).toBe('cruise')
    expect(bookingKind(line('c', 'guide', 'English Speaking Guide'))).toBe('guide')
    expect(bookingKind(line('d', 'supplies', 'Water Bottles'))).toBe('water')
    expect(bookingKind(line('e', 'tips', 'Tour guide - full day'))).toBe('tips')
  })

  it('a meal says which meal, or stays a meal', () => {
    expect(bookingKind(line('a', 'meal', 'Lunch'))).toBe('lunch')
    expect(bookingKind(line('b', 'meal', 'Dinner'))).toBe('dinner')
    expect(bookingKind(line('c', 'meal', 'Fish Market', '[pricing-grid:meals] Fish Market'))).toBe('meal')
  })

  it("the throughout guide's bed and a supplement are not the night", () => {
    expect(bookingKind(line('a', 'accommodation', 'Throughout Guide', '[pricing-grid:throughout_guide] bed'))).toBe('other')
    expect(bookingKind(line('b', 'accommodation', 'Single Supplement'))).toBe('other')
  })
})

describe('the day card', () => {
  const lines = [line('w', 'supplies', 'Water Bottles'), line('g', 'guide', 'English Speaking Guide'), aiHotel('h'), line('l', 'meal', 'Lunch')]

  it('shows the hotel by name, first', () => {
    expect(dayBookings(lines).map(b => [b.kind, b.label])).toEqual([
      ['hotel', 'Mena House'], ['guide', 'Guide'], ['lunch', 'Lunch'], ['water', 'Water'],
    ])
  })

  it('the day flags follow the lines', () => {
    expect(includesFromLines(lines)).toEqual({ guide: true, lunch: true, dinner: false, hotel: true, tips: false, water: true })
    expect(includesFromLines([])).toEqual({ guide: false, lunch: false, dinner: false, hotel: false, tips: false, water: false })
  })

  it("an unnamed meal leaves lunch and dinner to the box", () => {
    const inc = includesFromLines([line('m', 'meal', 'Fish Market', '[pricing-grid:meals] Fish Market')])
    expect(inc.lunch).toBeNull()
    expect(inc.dinner).toBeNull()
  })
})

describe('the night follows its hotel', () => {
  it('finds the hotel row from the grid pin or the AI service code; a typed line has none', () => {
    expect(hotelRateIdOf(gridHotel('a'))).toBe(MENA)
    expect(hotelRateIdOf(aiHotel('b', ALEX_HOTEL))).toBe(ALEX_HOTEL)
    expect(hotelRateIdOf(line('c', 'accommodation', 'Some hotel'))).toBeNull()
    expect(hotelRateIdOf(line('d', 'guide', 'Guide'))).toBeNull()
  })

  it("the booked hotel's city; a ship is on board", () => {
    expect(nightFromBooking([gridHotel('a')], new Map([['a', 'Cairo']]))).toEqual({ property: 'Mena House Cairo', kind: 'hotel', city: 'Cairo' })
    expect(nightFromBooking([aiHotel('a')], new Map())?.city).toBeNull()
    expect(nightFromBooking([line('s', 'cruise', 'Al Farida - Full Board')], new Map())).toEqual({ property: 'Al Farida', kind: 'cruise', city: 'On board Al Farida' })
  })
})

const day = (day_number: number, overnight_city: string | null, lines: CheckDay['lines'] = [], description = '', city = overnight_city): CheckDay =>
  ({ day_number, city, overnight_city, description, lines })

describe('stays', () => {
  it('groups the nights while the bed stays the same', () => {
    const cities = new Map([['h1', 'Cairo'], ['h2', 'Cairo'], ['h3', 'Cairo'], ['h4', 'Aswan']])
    const stays = tripStays([
      day(1, 'Cairo', [aiHotel('h1')]),
      day(2, 'Cairo', [aiHotel('h2')]),
      day(3, 'Cairo', [aiHotel('h3')], '', 'Alexandria'),
      day(4, 'Aswan', [{ ...aiHotel('h4'), supplier_name: 'Old Cataract' }]),
      day(5, null),
    ], cities)
    expect(stays).toEqual([
      { from: 1, to: 3, city: 'Cairo', property: 'Mena House', unbooked: false },
      { from: 4, to: 4, city: 'Aswan', property: 'Old Cataract', unbooked: false },
    ])
  })

  it('the departure day is no night unless one is booked on it', () => {
    expect(tripStays([day(1, 'Cairo'), day(2, 'Cairo')], new Map())).toEqual([
      { from: 1, to: 1, city: 'Cairo', property: null, unbooked: true },
    ])
  })

  it('an unpriced trip still lists its nights, unbooked', () => {
    expect(tripStays([day(1, 'Cairo'), day(2, 'Cairo'), day(3, null)], new Map())).toEqual([
      { from: 1, to: 2, city: 'Cairo', property: null, unbooked: true },
    ])
  })
})

describe('checks', () => {
  const opts = { sellsHotels: true }

  // Live 2026-10-06: "… Return to Cairo for overnight." over an Alexandria night.
  it('a day that returns to the night before, slept elsewhere', () => {
    const checks = tripChecks([
      day(1, 'Cairo', [aiHotel('h1')]),
      day(2, 'Alexandria', [aiHotel('h2', ALEX_HOTEL)], 'Full day trip to Alexandria. Return to Cairo for overnight.', 'Alexandria'),
      day(3, null, [line('t', 'transportation', 'Airport Transfer')]),
    ], new Map([['h1', 'Cairo'], ['h2', 'Alexandria']]), opts)
    expect(checks).toEqual([
      { day_number: 2, kind: 'returns-elsewhere', message: 'The description returns to Cairo, but the night is in Alexandria.' },
    ])
  })

  it("a hotel in another city than the night", () => {
    const checks = tripChecks([day(1, 'Alexandria', [aiHotel('h1')]), day(2, null)], new Map([['h1', 'Cairo']]), opts)
    expect(checks.map(c => c.message)).toEqual(['Mena House is in Cairo, but the night says Alexandria.'])
  })

  it('a night with no hotel, and a hotel with no night', () => {
    const checks = tripChecks([
      day(1, 'Cairo', [line('g', 'guide', 'Guide')]),
      day(2, null, [aiHotel('h2')]),
      day(3, 'Cairo'),
    ], new Map(), opts)
    expect(checks.map(c => [c.day_number, c.kind])).toEqual([[1, 'no-bed'], [2, 'bed-no-night']])
  })

  it('no "no hotel" check when the package sells none, or nothing is priced', () => {
    const days = [day(1, 'Cairo', [line('g', 'guide', 'Guide')]), day(2, null)]
    expect(tripChecks(days, new Map(), { sellsHotels: false })).toEqual([])
    expect(tripChecks([day(1, 'Cairo'), day(2, null)], new Map(), opts)).toEqual([])
  })

  it('a cruise night on board is not "elsewhere"', () => {
    const checks = tripChecks([day(1, 'On board Al Farida', [line('s', 'cruise', 'Al Farida - Full Board')]), day(2, null)], new Map(), opts)
    expect(checks).toEqual([])
  })
})

describe('dayReturnsTo', () => {
  it('reads a return to the city, not a mere mention', () => {
    expect(dayReturnsTo(['Return to Cairo for overnight.'], 'Cairo')).toBe(true)
    expect(dayReturnsTo(['Visit the museum', 'Drive back to Cairo'], 'Cairo')).toBe(true)
    expect(dayReturnsTo(['Drive from Cairo to Alexandria and check in.'], 'Cairo')).toBe(false)
    expect(dayReturnsTo(['Return to the hotel.'], null)).toBe(false)
  })
})
