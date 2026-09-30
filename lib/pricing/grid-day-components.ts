// A grid day's type and per-part overrides, as itinerary_days columns
// (migration 391). The grid's reload (app/pricing-grid/page.tsx) and its
// completeness gate read them back; before 391 nothing stored them, so every
// reload reset every day to the default "tour" day.
//
// Values are checked here rather than trusted: the save is one transaction,
// so one unexpected value would otherwise fail the whole itinerary's save.
// An unknown type falls back to 'tour' (the column default); an unknown
// intercity or a non-boolean override becomes NULL — "use the type's default".
import { DAY_TYPES, type GridDay } from '@/app/pricing-grid/types'

const INTERCITY = ['none', 'road', 'flight'] as const

export interface DayComponentColumns {
  day_type: string
  overnight: boolean | null
  has_sightseeing: boolean | null
  airport_arrival: boolean | null
  airport_departure: boolean | null
  hotel_check_in: boolean | null
  hotel_check_out: boolean | null
  intercity: string | null
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

export function gridDayComponents(day: Partial<GridDay>): DayComponentColumns {
  return {
    day_type: day.dayType && (DAY_TYPES as string[]).includes(day.dayType) ? day.dayType : 'tour',
    overnight: bool(day.overnight),
    has_sightseeing: bool(day.hasSightseeing),
    airport_arrival: bool(day.airportArrival),
    airport_departure: bool(day.airportDeparture),
    hotel_check_in: bool(day.hotelCheckIn),
    hotel_check_out: bool(day.hotelCheckOut),
    intercity: day.intercity && (INTERCITY as readonly string[]).includes(day.intercity) ? day.intercity : null,
  }
}
