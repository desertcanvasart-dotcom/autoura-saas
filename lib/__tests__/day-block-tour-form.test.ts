import { describe, it, expect } from 'vitest'
import { blockToTourDay } from '@/lib/day-blocks/tour-form'
import type { GridBlock } from '@/lib/day-blocks/grid-apply'

const none = { included: false, venue: null }
const block = (over: Partial<GridBlock>): GridBlock => ({
  code: 'X', name: 'X', shorthand: [], day_type: 'tour', city: 'Cairo', to_city: null, night: 'same', night_place: null,
  attractions: [], photo_stops: [], guide: 'egyptologist', meals: { breakfast: none, lunch: none, dinner: none },
  transport: null, assistance: [], optional_extras: [], description: null, notes: null, source: null, ...over,
})

const FEES = [
  { id: 'f-giza', attraction_name: 'Giza Pyramids', city: 'Giza' },
  { id: 'f-gem', attraction_name: 'Grand Egyptian Museum', city: 'Cairo' },
  { id: 'f-kom-cai', attraction_name: 'Kom Ombo Temple', city: 'Cairo' },
  { id: 'f-kom', attraction_name: 'Kom Ombo Temple', city: 'Kom Ombo' },
]

describe('a day tour block in a package', () => {
  const giza = block({
    code: 'CAI-GIZ-GEM', name: 'Giza Pyramids, Sphinx & GEM', description: 'Your day begins …',
    attractions: ['Giza Plateau', 'Grand Egyptian Museum'], photo_stops: ['Great Sphinx'],
    meals: { breakfast: none, lunch: { included: true, venue: 'restaurant' }, dinner: none },
    transport: 'day tour Cairo, 8h',
    attraction_checks: [
      { name: 'Giza Plateau', ok: true, fees: ['Giza Pyramids'] },
      { name: 'Grand Egyptian Museum', ok: true, fees: ['Grand Egyptian Museum'] },
    ],
  })

  it('fills the form: a hotel night where it is, a restaurant lunch as a priced line, fees by id', () => {
    expect(blockToTourDay(giza, FEES)).toEqual({
      title: 'Giza Pyramids, Sphinx & GEM',
      description: 'Your day begins …',
      city: 'Cairo',
      night: 'hotel',
      meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
      picked: [{ id: 'f-giza', name: 'Giza Pyramids' }, { id: 'f-gem', name: 'Grand Egyptian Museum' }],
      transportType: '',
      legFrom: '',
      legTo: '',
      length: 'day_tour',
      noSightseeing: false,
      cruiseAssist: {},
      notes: [],
    })
  })

  it('on a one-day tour, asks no night', () => {
    expect(blockToTourDay(giza, FEES, { dayTour: true }).night).toBe('')
  })
})

describe('a day that moves you', () => {
  it('a flight is placed where it lands, with its leg', () => {
    const fill = blockToTourDay(block({ day_type: 'transfer', city: 'Cairo', to_city: 'Luxor', night: 'move', transport: 'flight + airport transfers both ends' }), FEES)
    expect(fill).toMatchObject({ city: 'Luxor', night: 'hotel', transportType: 'flight', legFrom: 'Cairo', legTo: 'Luxor', noSightseeing: true })
  })

  it('a road transfer with stops: a long day, placed where it ends, fees in the stop’s own city first', () => {
    const fill = blockToTourDay(block({ day_type: 'transfer', city: 'Kom Ombo', to_city: 'Aswan', night: 'move', attractions: ['Kom Ombo Temple'], transport: 'road Luxor-Aswan with stops, 10h' }), FEES)
    expect(fill).toMatchObject({ city: 'Aswan', transportType: '', legFrom: 'Kom Ombo', legTo: 'Aswan', length: 'long_day_tour', picked: [{ id: 'f-kom', name: 'Kom Ombo Temple' }] })
  })
})

describe('nights and meals the block itself includes', () => {
  it('a cruise day: on board, meals in the rate, boarding assistance', () => {
    const ship = { included: true, venue: 'ship' }
    const fill = blockToTourDay(block({ day_type: 'cruise', city: 'Luxor', night: 'on_board', meals: { breakfast: none, lunch: ship, dinner: ship }, assistance: ['boarding assist'] }), FEES)
    expect(fill).toMatchObject({ night: 'cruise', meals: { breakfast: 'none', lunch: 'included', dinner: 'included' }, cruiseAssist: { embark: true } })
  })

  it('a camp night is in the package: no hotel, and it says so', () => {
    const fill = blockToTourDay(block({ day_type: 'transfer', night: 'included', night_place: 'White Desert camp', meals: { breakfast: none, lunch: none, dinner: { included: true, venue: 'camp' } } }), FEES)
    expect(fill.night).toBe('none')
    expect(fill.meals.dinner).toBe('included')
    expect(fill.notes).toEqual(["The night is part of the block's own package (White Desert camp): no hotel is booked for it."])
  })

  it('a departure has no night', () => {
    expect(blockToTourDay(block({ day_type: 'departure', night: 'none' }), FEES).night).toBe('none')
  })
})

describe('what the form cannot hold', () => {
  it('an attraction with no fee, and an assistant instead of a guide, are said', () => {
    const fill = blockToTourDay(block({ city: 'Aswan', attractions: ['Baron Palace'], guide: 'assistant' }), FEES)
    expect(fill.picked).toEqual([])
    expect(fill.notes).toEqual([
      'No entrance fee called "Baron Palace" — pick it below, or add it in Rates.',
      "This day has an English-speaking assistant instead of an Egyptologist: set it on the tour's variation.",
    ])
  })
})
