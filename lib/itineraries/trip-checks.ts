// ============================================
// Where each night is, and what disagrees — from the day's bookings
// ============================================
// The night is where its bed is (overnight-city.ts). A day stores an
// overnight city and, separately, its hotel line; nothing kept the two
// together, so a day trip to Alexandria could say "Overnight in Alexandria"
// over a Cairo hotel, or the other way round.
//
//  · tripStays     — the trip's nights grouped by where they are slept:
//                    "Nights 1–3 · Cairo · Mena House".
//  · nightFromBooking — the city a day's booked hotel puts its night in.
//  · tripChecks    — what the editor flags before the trip goes out.
//
// Pure: the editor hands in the lines and the booked hotels' cities.

import { bookingKind, type BookingLine } from './day-bookings'
import { propertyFromService } from './overnight-property'
import { dayReturnsTo } from './overnight-city'

export interface CheckDay {
  day_number: number
  city: string | null
  overnight_city: string | null
  description?: string | null
  lines: readonly BookingLine[]
}

/** service id → the city of the hotel row it was booked from (Rates). */
export type LineCities = ReadonlyMap<string, string>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The hotel row (accommodation_rates) a night line was booked from: the
 * grid's pin, or the AI generator's service_code. Null for a typed line.
 */
export function hotelRateIdOf(line: BookingLine): string | null {
  if (bookingKind(line) !== 'hotel') return null
  if (line.rate_table === 'accommodation_rates' && line.rate_id && UUID_RE.test(line.rate_id)) return line.rate_id
  if (line.service_code && UUID_RE.test(line.service_code)) return line.service_code
  return null
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
const ON_BOARD = /^on board\b/i

/** The day's night line: its hotel or ship. */
export function nightLine(lines: readonly BookingLine[]): BookingLine | null {
  return lines.find(l => {
    const k = bookingKind(l)
    return k === 'hotel' || k === 'cruise'
  }) ?? null
}

export interface BookedNight {
  /** The hotel or ship, when the line names it. */
  property: string | null
  kind: 'hotel' | 'cruise'
  /** Where the booking puts the night: the hotel's city, or "On board <ship>". Null when unknown. */
  city: string | null
}

/** What the day's booking says about its night, or null when nothing is booked. */
export function nightFromBooking(lines: readonly BookingLine[], cities: LineCities): BookedNight | null {
  const line = nightLine(lines)
  if (!line) return null
  const kind = bookingKind(line) === 'cruise' ? 'cruise' : 'hotel'
  const property = propertyFromService(line)?.name ?? null
  const city = kind === 'cruise'
    ? (property ? `On board ${property}` : null)
    : cities.get(line.id) ?? null
  return { property, kind, city }
}

export interface Stay {
  from: number
  to: number
  city: string | null
  property: string | null
  /** No hotel or ship is booked for these nights. */
  unbooked: boolean
}

/**
 * The trip's nights, grouped while the bed stays the same. A day with no
 * night (departure, "No overnight") ends a stay.
 */
export function tripStays(days: readonly CheckDay[], cities: LineCities): Stay[] {
  const stays: Stay[] = []
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)
  const lastDay = sorted[sorted.length - 1]?.day_number
  for (const day of sorted) {
    const booked = nightFromBooking(day.lines, cities)
    const city = booked?.city ?? day.overnight_city ?? null
    if (!city && !booked) continue
    // The departure day has no night unless one is booked on it.
    if (day.day_number === lastDay && !booked) continue
    const property = booked?.property ?? null
    const last = stays[stays.length - 1]
    if (
      last && last.to === day.day_number - 1 &&
      norm(last.city) === norm(city) && norm(last.property) === norm(property) &&
      last.unbooked === !booked
    ) {
      last.to = day.day_number
    } else {
      stays.push({ from: day.day_number, to: day.day_number, city, property, unbooked: !booked })
    }
  }
  return stays
}

export type CheckKind = 'hotel-elsewhere' | 'no-bed' | 'bed-no-night' | 'returns-elsewhere'

export interface TripCheck {
  day_number: number
  kind: CheckKind
  message: string
}

export interface CheckOptions {
  /** The package sells hotels (not tours-only / day trips / cruise only). */
  sellsHotels: boolean
}

/** What disagrees, day by day. Only priced itineraries have lines to compare. */
export function tripChecks(days: readonly CheckDay[], cities: LineCities, opts: CheckOptions): TripCheck[] {
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)
  const priced = sorted.some(d => d.lines.length > 0)
  const lastDay = sorted[sorted.length - 1]?.day_number
  const out: TripCheck[] = []
  let nightBefore: string | null = null

  for (const day of sorted) {
    const booked = nightFromBooking(day.lines, cities)
    const night = day.overnight_city
    const name = booked?.property ?? (booked?.kind === 'cruise' ? 'The cruise' : 'The hotel')

    if (booked?.city && night && norm(booked.city) !== norm(night) && !(booked.kind === 'cruise' && ON_BOARD.test(night))) {
      out.push({
        day_number: day.day_number,
        kind: 'hotel-elsewhere',
        message: `${name} is in ${booked.city}, but the night says ${night}.`,
      })
    }
    if (booked && !night) {
      out.push({
        day_number: day.day_number,
        kind: 'bed-no-night',
        message: `${name} is booked, but the day has no overnight.`,
      })
    }
    if (priced && opts.sellsHotels && !booked && night && day.day_number !== lastDay) {
      out.push({
        day_number: day.day_number,
        kind: 'no-bed',
        message: `No hotel is booked for the night in ${night}.`,
      })
    }
    // "Return to Cairo for overnight" over a night elsewhere.
    const sleptIn = booked?.city ?? night
    if (
      nightBefore && sleptIn && norm(sleptIn) !== norm(nightBefore) && !ON_BOARD.test(sleptIn) &&
      dayReturnsTo([day.description], nightBefore)
    ) {
      out.push({
        day_number: day.day_number,
        kind: 'returns-elsewhere',
        message: `The description returns to ${nightBefore}, but the night is in ${sleptIn}.`,
      })
    }
    const ashore = sleptIn && !ON_BOARD.test(sleptIn) ? sleptIn : null
    nightBefore = booked?.kind === 'cruise' ? null : ashore ?? nightBefore
  }
  return out
}
