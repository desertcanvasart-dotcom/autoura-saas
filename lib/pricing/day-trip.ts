// ============================================
// A day trip — sightseeing in one city, the night back where the stay is
// ============================================
// A day has one city, and the pricing engine read it as where the party is
// all day AND where it sleeps. An Alexandria day trip from a Cairo hotel had
// no way to say so: filed under Alexandria, the engine moved the party there
// by road (a one-way drop-off), looked for the night's hotel in Alexandria,
// and drove it back to Cairo the next day as a second drop-off (live
// ITN-S-2026-8987). Filed under Cairo, it priced a day tour in Cairo.
//
// The day editor now says it: the day's city is where the sightseeing is, and
// `day_trip_from` is where the party is staying. The engine then reads the
// day AS BASED in the stay — its hotel, the road moves before and after it —
// and prices the vehicle as the agency's "Intercity Day Trip", stay →
// sightseeing city and back. The guide is the stay's, who goes along.
//
// Only a road day can be a day trip: a ticket day (flight, train, sleeper),
// a night aboard a ship and a day in the air each move or keep the party by
// their own rules, so `day_trip_from` on those is ignored.
//
// Pure: the engine, the day editor and the tests share it.

const clean = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)

export interface DayTripDay {
  city?: unknown
  day_trip_from?: unknown
  transport_type?: unknown
  accommodation_type?: unknown
  in_transit?: unknown
}

/** Where a day trip starts and ends, or null when the day is not one. */
export function dayTripFrom(day: DayTripDay): string | null {
  const from = clean(day.day_trip_from)
  const city = clean(day.city)
  if (!from || !city) return null
  if (from.toLowerCase() === city.toLowerCase()) return null
  if (day.transport_type || day.accommodation_type === 'cruise' || day.in_transit === true) return null
  return from
}

/**
 * A saved itinerary day, as a day trip's stay: its overnight city when that
 * is not the day's city, on a road day with a hotel night. The overnight city
 * is resolved the same way everywhere (lib/itineraries/overnight-city) — on a
 * day that moves, it IS the day's city — so a difference is a day trip.
 */
export function dayTripFromItineraryDay(
  day: { city?: string | null; overnight_city?: string | null; intercity?: string | null; transport_type?: string | null; is_cruise_day?: boolean | null },
  accommodationType: string,
): string | null {
  if (accommodationType !== 'hotel' || day.is_cruise_day) return null
  if (day.intercity === 'road' || day.intercity === 'flight') return null
  const night = String(day.overnight_city ?? '').trim()
  if (/^on board\b/i.test(night)) return null
  return dayTripFrom({ city: day.city, day_trip_from: night, transport_type: day.transport_type })
}
