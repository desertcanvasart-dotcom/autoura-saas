// ============================================
// The transport a GENERATED day needs — decided by the tour engine's own rule
// ============================================
// The AI itinerary generator priced every non-free day at the day rate of a
// FLEET vehicle (`vehicles.daily_rate`). No agency has a fleet vehicle on file
// (checked on production 2026-09-22: 0 rows for all 8), so the generator
// withheld its price from everyone — while each agency has 500+ real rows in
// Rates → Transportation, which is what the tour engine prices from.
//
// One rule, not two: a generated day is translated into the engine's day and
// handed to the engine's OWN `determineTransportNeeds`. So a generated day and
// a tour day that say the same thing ask for the same rate:
//
//   airport arrival / departure   →  Airport Transfer, in the day's city
//   a day trip                    →  Intercity Day Trip, STAY → CITY
//   the city changed, by road     →  Intercity Drop-off, FROM → TO
//   guided sightseeing            →  Day Tour, in the day's city
//   none of those, or a free day  →  no transport
//
// The engine gives a day ONE transport need, in that order of precedence. An
// arrival day that also tours is therefore charged its airport transfer and
// not a day tour as well — the engine's rule, kept on purpose so the two
// paths agree; changing it is a change to the engine, for both.
//
// A DAY TRIP is a day whose night is back where the party stays, a drive away
// (Alexandria from a Cairo hotel) — the night the generator books, read with
// its own rule (generatedOvernightCity). The engine's day trip
// (lib/pricing/day-trip): based in the stay, the vehicle out and back. It used
// to read as a move to Alexandria and a second one back the next day — two
// one-way drop-offs for a trip the agency prices once.
import { determineTransportNeeds, type ItineraryDay } from '@/lib/auto-pricing-service'
import { generatedOvernightCity } from '@/lib/ai/service-creation'
import { citiesFarApart } from '@/lib/pricing/day-trip'

export interface GeneratedDay {
  day_number?: number
  city?: string | null
  is_arrival?: boolean
  is_departure?: boolean
  is_transfer_only?: boolean
  is_free_day?: boolean
  is_sailing_day?: boolean
  is_cruise_day?: boolean
  accommodation_type?: string | null
  guide_required?: boolean
  attractions?: unknown
  flight_info?: unknown
  /** Where the AI says the night is; read with the generator's own rule. */
  overnight_city?: string | null
  description?: string | null
  activities?: readonly string[] | null
}

export interface GeneratedDayTransportNeed {
  day: number
  serviceType: string
  duration: string
  /** Where the rate is looked up: the day's city (the destination of a road move). */
  city: string
  /** Set on a road move between cities. */
  originCity?: string
  specialVehicleType?: string
  /** What the line says. */
  label: string
}

const LABEL: Record<string, string> = {
  airport_transfer: 'Airport Transfer',
  intercity_day_trip: 'Day Trip Transportation',
  intercity_dropoff: 'Road Transfer',
  day_tour: 'Day Tour Transportation',
  half_day: 'Half-Day Transportation',
  long_day_tour: 'Long Day Tour Transportation',
}

const isFree = (d: GeneratedDay) => !!(d.is_free_day || d.is_sailing_day)
const onShip = (d: GeneratedDay) => !!(d.is_cruise_day || d.accommodation_type === 'cruise')
const cityOf = (d: GeneratedDay, fallback: string) => String(d.city || fallback || '').trim()

/** A generated day, as the engine sees a day — only what its transport rule
 *  reads. `stay` is the city of a day trip's night: the day is then based
 *  there, with its own city as where it goes. */
function asEngineDay(d: GeneratedDay, effectiveCity: string, stay: string | null = null): ItineraryDay {
  const transferOnly = !!d.is_transfer_only
  const guided = d.guide_required !== false && !transferOnly && !isFree(d)
  return {
    day: d.day_number || 1,
    city: stay ?? cityOf(d, effectiveCity),
    ...(stay ? { day_trip_to: cityOf(d, effectiveCity) } : {}),
    accommodation_type: onShip(d) ? 'cruise' : 'none',
    attractions: guided && Array.isArray(d.attractions) ? d.attractions.filter((a): a is string => typeof a === 'string') : [],
    // A transfer-only day IS its airport run, whichever flag the AI set.
    services: { airport_arrival: !!d.is_arrival || (transferOnly && !d.is_departure), airport_departure: !!d.is_departure, guide_required: guided },
  } as unknown as ItineraryDay
}

/**
 * Where each generated day trip stays: the night's city when it is a drive
 * away from the day's own, on a sightseeing road day. null elsewhere — an
 * arrival, a departure, a transfer, a flight, a ship, a free day, or a night
 * in the day's own city (or next door to it).
 */
export function dayTripStays(days: readonly GeneratedDay[] | null | undefined, effectiveCity: string): (string | null)[] {
  let lastNightAshore: string | null = null
  return (days ?? []).map(d => {
    const onBoard = onShip(d)
    // The night the generator BOOKS (hotelNightsForGeneratedDays): the AI's
    // overnight city, corrected for a day that says it returns; with none,
    // the day's own city.
    const night = (d.overnight_city ? generatedOvernightCity(d, lastNightAshore) : null) || cityOf(d, effectiveCity)
    lastNightAshore = onBoard ? null : night
    if (onBoard || isFree(d) || d.is_arrival || d.is_departure || d.is_transfer_only || d.flight_info) return null
    const city = cityOf(d, effectiveCity)
    return night && city && citiesFarApart(night, city) ? night : null
  })
}

/** The one transport need of each generated day; days with none are left out. */
export function transportNeedsForGeneratedDays(days: readonly GeneratedDay[] | null | undefined, effectiveCity: string): GeneratedDayTransportNeed[] {
  const list = [...(days ?? [])]
  const stays = dayTripStays(list, effectiveCity)
  const out: GeneratedDayTransportNeed[] = []
  list.forEach((d, i) => {
    if (isFree(d)) return
    const day = asEngineDay(d, effectiveCity, stays[i])
    if (!day.city) return
    // A flight moves the group, not a car: no road transfer on a day that flies.
    // A neighbour that is a day trip is where it stays: the party never moved.
    const prev = i > 0 && !d.flight_info ? asEngineDay(list[i - 1], effectiveCity, stays[i - 1]) : null
    const next = i < list.length - 1 ? asEngineDay(list[i + 1], effectiveCity, stays[i + 1]) : null

    const airport = day.services.airport_arrival || day.services.airport_departure
    const movesByRoad = !!prev && !!prev.city && prev.city.toLowerCase() !== day.city.toLowerCase() &&
      day.accommodation_type !== 'cruise' && prev.accommodation_type !== 'cruise'
    const sightseeing = day.services.guide_required || day.attractions.length > 0
    // (A day trip needs its vehicle whatever it sees: it is the road there.)
    if (!airport && !movesByRoad && !sightseeing && !stays[i]) return // the engine's `requiresTransport`

    const needs = determineTransportNeeds(day, prev, next)
    const serviceType = String(needs.serviceType)
    if (needs.originCity && needs.destinationCity) {
      // A day trip: the rate is the road out and back, looked up FROM → TO.
      out.push({
        day: day.day, serviceType, duration: '', city: needs.destinationCity, originCity: needs.originCity,
        label: `Day Trip ${needs.originCity} → ${needs.destinationCity} and back`,
      })
      return
    }
    out.push({
      day: day.day,
      serviceType,
      duration: serviceType === 'airport_transfer' || serviceType.startsWith('intercity') ? 'one_way' : '',
      city: day.city,
      ...(serviceType.startsWith('intercity') && prev ? { originCity: prev.city } : {}),
      ...(needs.useSpecialVehicle && needs.specialVehicleType ? { specialVehicleType: String(needs.specialVehicleType) } : {}),
      label: serviceType.startsWith('intercity') && prev ? `Road Transfer ${prev.city} → ${day.city}` : (LABEL[serviceType] ?? 'Transportation'),
    })
  })
  return out
}
