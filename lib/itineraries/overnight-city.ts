// ============================================
// Where each night is spent — one rule for every path that builds days
// ============================================
// A day has two places: where it is SPENT (its city: the sightseeing) and
// where it ENDS (its overnight city: the bed). They differ on a day trip. A
// Cairo-based trip that spends Day 3 in Alexandria sleeps in Cairo — but the
// Pricing Grid saved the day's city as its overnight city, so the itinerary
// said "Overnight in Alexandria" while the night's hotel was Mena House in
// Cairo (live ITN-S-2026-8987).
//
// The rule, in order:
//   1. a departure day (no night)              → none;
//   2. a hotel or ship is booked that night    → where it is (the hotel's
//                                                city in Rates; "On board
//                                                <ship>" on a cruise);
//   3. an intercity transfer or flight day     → the day's city (the
//                                                destination);
//   4. any other night                         → where the night before was
//                                                ashore (a cruise resets it):
//                                                a day trip does not move you;
//   5. nothing before it (the first night)     → the day's city.
//
// The day's own city is never the overnight city just because it is the
// day's city — only when nothing better says where the bed is.

export type Intercity = 'none' | 'road' | 'flight'

export interface OvernightDay {
  /** Where the day is spent. */
  city: string | null | undefined
  /** False on a departure day: the day does not end with a night. */
  overnight: boolean
  intercity?: Intercity | null
  /** The city of the hotel booked for the night, from Rates. */
  propertyCity?: string | null
  /** The ship, when the night is spent on board. */
  cruiseShip?: string | null
}

const ON_BOARD = /^on board\b/i
const clean = (s: string | null | undefined) => String(s ?? '').trim() || null

/** Each day's overnight city, in day order; null where the day has no night. */
export function resolveOvernightCities(days: readonly OvernightDay[]): (string | null)[] {
  const out: (string | null)[] = []
  let lastOnLand: string | null = null
  for (const day of days) {
    const city = clean(day.city)
    if (!day.overnight) {
      out.push(null)
      continue
    }
    const ship = clean(day.cruiseShip)
    if (ship) {
      out.push(`On board ${ship}`)
      // A cruise moves you: the night before it says nothing about the next
      // night ashore.
      lastOnLand = null
      continue
    }
    const property = clean(day.propertyCity)
    const night: string | null =
      property ??
      (day.intercity === 'road' || day.intercity === 'flight' ? city : null) ??
      lastOnLand ??
      city
    out.push(night)
    if (night && !ON_BOARD.test(night)) lastOnLand = night
  }
  return out
}
