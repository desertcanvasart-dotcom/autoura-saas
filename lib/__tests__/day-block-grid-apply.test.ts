import { describe, it, expect } from 'vitest'
import { applyBlockToGridDay, type GridBlock } from '@/lib/day-blocks/grid-apply'
import { SLOT_DEFINITIONS, type AllRates, type GridDay } from '@/app/pricing-grid/types'

const emptyDay = (over: Partial<GridDay> = {}): GridDay => ({
  id: 'd1', dayNumber: 2, title: 'Day 2', city: '', description: '', isExpanded: false,
  slots: SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 })),
  ...over,
})

const vehicles = (id: string, service_type: string, origin: string, destination: string | null = null) => [
  { id: `${id}__sedan`, name: `Sedan — ${origin}`, rateEur: 40, rateNonEur: 40, service_type, city: origin, origin_city: origin, destination_city: destination, capacity_min: 1, capacity_max: 2 },
  { id: `${id}__van`, name: `Van — ${origin}`, rateEur: 70, rateNonEur: 70, service_type, city: origin, origin_city: origin, destination_city: destination, capacity_min: 3, capacity_max: 7 },
]

const rates = {
  route: [
    // The out-of-town route first: an in-city tour must still pick the in-city one.
    ...vehicles('cai-alx', 'day_tour', 'Cairo', 'Alexandria'),
    ...vehicles('cai-tour', 'day_tour', 'Cairo'),
    ...vehicles('lxr-asw', 'intercity_transfer', 'Luxor', 'Aswan'),
    ...vehicles('cai-apt', 'airport_transfer', 'Cairo'),
    ...vehicles('lxr-apt', 'airport_transfer', 'Luxor'),
  ],
  guide: [
    { id: 'g-cai', name: 'English (Egyptologist)', rateEur: 50, rateNonEur: 50, city: 'Cairo' },
    { id: 'g-asw-a', name: 'English (Assistant)', rateEur: 20, rateNonEur: 20, city: 'Aswan' },
  ],
  airport_services: [], hotel_services: [], tipping: [], boat_rides: [], experiences: [], water: [], cruise: [],
  accommodation: [
    { id: 'h-cai', name: 'Mena House Cairo (standard | BB)', rateEur: 90, rateNonEur: 90, city: 'Cairo' },
  ],
  entrance_fees: [
    { id: 'f-giza', name: 'Giza Pyramids', rateEur: 20, rateNonEur: 20, city: 'Giza' },
    { id: 'f-gem', name: 'Grand Egyptian Museum', rateEur: 30, rateNonEur: 30, city: 'Cairo' },
    { id: 'f-cat', name: 'Catacombs of Kom El Shoqafa', rateEur: 10, rateNonEur: 10, city: 'Alexandria' },
  ],
  flights: [
    { id: 'fl-1', name: 'EgyptAir CAI→LXR (economy)', rateEur: 80, rateNonEur: 80, city: 'CAI', route_from: 'CAI', route_to: 'LXR' },
  ],
  meals: [
    { id: 'm-cai-l', name: 'Lunch - Andrea (Cairo)', rateEur: 15, rateNonEur: 15, city: 'Cairo', category: 'Lunch' },
    { id: 'm-alx-l', name: 'Lunch - Fish Market (Alexandria)', rateEur: 18, rateNonEur: 18, city: 'Alexandria', category: 'Lunch' },
  ],
} as unknown as AllRates

const meals = (lunch: string | null, dinner: string | null = null) => ({
  breakfast: { included: false, venue: null },
  lunch: { included: lunch !== null, venue: lunch },
  dinner: { included: dinner !== null, venue: dinner },
})

const block = (over: Partial<GridBlock>): GridBlock => ({
  code: 'X', name: 'X', shorthand: [], day_type: 'tour', city: 'Cairo', to_city: null, night: 'same', night_place: null,
  attractions: [], photo_stops: [], guide: 'none', meals: meals(null), transport: null, assistance: [],
  optional_extras: [], description: null, notes: null, source: null,
  ...over,
})

const ids = (day: GridDay, slotId: string) => day.slots.find(s => s.slotId === slotId)!.selectedItems.map(i => i.rateId)

describe('a day tour block', () => {
  const giza = block({
    code: 'CAI-GIZ-GEM', name: 'Giza Pyramids, Sphinx & GEM', city: 'Cairo', description: 'Your day begins …',
    attractions: ['Giza Plateau', 'Grand Egyptian Museum'], photo_stops: ['Great Sphinx'], guide: 'egyptologist', meals: meals('restaurant'),
    attraction_checks: [
      { name: 'Giza Plateau', ok: true, fees: ['Giza Pyramids'] },
      { name: 'Grand Egyptian Museum', ok: true, fees: ['Grand Egyptian Museum'] },
    ],
  })

  it('takes its title, city, description and type, and picks its services from the rates', () => {
    const { day, filled, toPick } = applyBlockToGridDay(emptyDay(), giza, rates, 4)
    expect(day).toMatchObject({ title: 'Giza Pyramids, Sphinx & GEM', city: 'Cairo', description: 'Your day begins …', dayType: 'tour', overnight: true, hasSightseeing: true, intercity: 'none' })
    // The alias's fee name, not the block's wording.
    expect(ids(day, 'entrance_fees')).toEqual(['f-giza', 'f-gem'])
    expect(ids(day, 'guide')).toEqual(['g-cai'])
    expect(ids(day, 'meals')).toEqual(['m-cai-l'])
    // The van fits four.
    expect(ids(day, 'route')).toEqual(['cai-tour__van'])
    expect(filled).toEqual(['2 entrance fee(s)', 'guide', 'lunch', 'transport'])
    expect(toPick).toEqual([])
  })

  it('keeps the hotel the day already had: a day tour books no bed', () => {
    const withHotel = emptyDay({ slots: emptyDay().slots.map(s => s.slotId === 'accommodation' ? { ...s, selectedItems: [{ rateId: 'h-cai', name: 'Mena House', rateEur: 90, rateNonEur: 90 }] } : s) })
    expect(ids(applyBlockToGridDay(withHotel, giza, rates, 2).day, 'accommodation')).toEqual(['h-cai'])
  })
})

describe('a day trip out of town', () => {
  it('finds the day tour that goes to the city, and lunch there', () => {
    const alx = block({ code: 'CAI-ALX', city: 'Alexandria', attractions: ['Catacombs of Kom El Shoqafa'], guide: 'egyptologist', meals: meals('restaurant') })
    const { day, toPick } = applyBlockToGridDay(emptyDay(), alx, rates, 2)
    expect(ids(day, 'route')).toEqual(['cai-alx__sedan'])
    expect(ids(day, 'meals')).toEqual(['m-alx-l'])
    expect(ids(day, 'entrance_fees')).toEqual(['f-cat'])
    // No guide rate in Alexandria: the operator picks one, nothing is guessed.
    expect(toPick).toEqual(['Guide in Alexandria'])
    expect(ids(day, 'guide')).toEqual([])
  })
})

describe('a transfer', () => {
  it('by road: the route from the city to the next, and the hotel there is the operator’s pick', () => {
    const withHotel = emptyDay({ slots: emptyDay().slots.map(s => s.slotId === 'accommodation' ? { ...s, selectedItems: [{ rateId: 'h-cai', name: 'Mena House', rateEur: 90, rateNonEur: 90 }] } : s) })
    const { day, toPick } = applyBlockToGridDay(withHotel, block({ day_type: 'transfer', city: 'Luxor', to_city: 'Aswan', night: 'move', transport: 'road Luxor-Aswan' }), rates, 2)
    expect(day).toMatchObject({ dayType: 'transfer', intercity: 'road', city: 'Luxor' })
    expect(ids(day, 'route')).toEqual(['lxr-asw__sedan'])
    // A Cairo hotel is not a night in Aswan.
    expect(ids(day, 'accommodation')).toEqual([])
    expect(toPick).toEqual(['Hotel in Aswan'])
  })

  it('by air: the flight, and the airport transfer at each end', () => {
    const { day, toPick } = applyBlockToGridDay(emptyDay(), block({
      day_type: 'transfer', city: 'Cairo', to_city: 'Luxor', night: 'move', transport: 'flight + airport transfers both ends',
      assistance: ['check-out', 'airport both ends', 'check-in'],
    }), rates, 2)
    expect(day).toMatchObject({ intercity: 'flight', airportArrival: true, airportDeparture: true, hotelCheckIn: true, hotelCheckOut: true })
    expect(ids(day, 'flights')).toEqual(['fl-1'])
    expect(ids(day, 'route')).toEqual(['cai-apt__sedan', 'lxr-apt__sedan'])
    expect(toPick).toEqual(['Hotel in Luxor'])
  })
})

describe('the night', () => {
  it('a departure has none: hotel and cruise go, the airport transfer comes', () => {
    const withHotel = emptyDay({ slots: emptyDay().slots.map(s => s.slotId === 'accommodation' ? { ...s, selectedItems: [{ rateId: 'h-cai', name: 'Mena House', rateEur: 90, rateNonEur: 90 }] } : s) })
    const { day } = applyBlockToGridDay(withHotel, block({ day_type: 'departure', city: 'Cairo', night: 'none', assistance: ['hotel check-out', 'airport departure'] }), rates, 2)
    expect(day).toMatchObject({ overnight: false, airportDeparture: true, hotelCheckOut: true, airportArrival: false })
    expect(ids(day, 'accommodation')).toEqual([])
    expect(ids(day, 'route')).toEqual(['cai-apt__sedan'])
  })

  it('a night the block includes (a camp) books no hotel, and its camp dinner is not a meal line', () => {
    const { day, filled } = applyBlockToGridDay(emptyDay(), block({ day_type: 'transfer', city: 'Bahariya Oasis', night: 'included', night_place: 'White Desert camp', meals: meals('restaurant', 'camp') }), rates, 2)
    expect(ids(day, 'accommodation')).toEqual([])
    expect(ids(day, 'meals')).toEqual([])
    expect(filled).toContain('night included (White Desert camp)')
  })
})

describe('an assistant instead of a guide', () => {
  it('takes the assistant rate, never the Egyptologist', () => {
    const { day } = applyBlockToGridDay(emptyDay(), block({ city: 'Aswan', guide: 'assistant' }), rates, 2)
    expect(ids(day, 'guide')).toEqual(['g-asw-a'])
  })
})

describe('an attraction with no fee', () => {
  it('is listed to pick, and the rest still price', () => {
    const { day, toPick } = applyBlockToGridDay(emptyDay(), block({ attractions: ['Grand Egyptian Museum', 'Baron Palace'] }), rates, 2)
    expect(ids(day, 'entrance_fees')).toEqual(['f-gem'])
    expect(toPick).toContain('Entrance fee: Baron Palace')
  })
})
