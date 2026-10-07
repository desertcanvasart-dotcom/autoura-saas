import { describe, it, expect } from 'vitest'
import { gridDayComponents } from '@/lib/pricing/grid-day-components'

// A grid day's settings as itinerary_days columns (migration 391). The save is
// one transaction, so an unexpected value must degrade to "default", never
// fail the whole itinerary's save.
describe('gridDayComponents', () => {
  it('passes a valid type, overrides and intercity through', () => {
    expect(gridDayComponents({
      dayType: 'arrival', overnight: true, hasSightseeing: false, airportArrival: true,
      airportDeparture: false, hotelCheckIn: true, hotelCheckOut: false, intercity: 'road',
    })).toEqual({
      day_type: 'arrival', overnight: true, has_sightseeing: false, airport_arrival: true,
      airport_departure: false, hotel_check_in: true, hotel_check_out: false, intercity: 'road',
    })
  })

  it('an unset day is a tour day with every override left to the type (null)', () => {
    expect(gridDayComponents({})).toEqual({
      day_type: 'tour', overnight: null, has_sightseeing: null, airport_arrival: null,
      airport_departure: null, hotel_check_in: null, hotel_check_out: null, intercity: null,
    })
  })

  it('unknown values fall back instead of failing the save', () => {
    const out = gridDayComponents({ dayType: 'party' as never, intercity: 'teleport' as never, overnight: 'yes' as never })
    expect(out).toMatchObject({ day_type: 'tour', intercity: null, overnight: null })
  })
})
