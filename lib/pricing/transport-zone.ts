// ============================================
// Transport by the hotel's area, and by the sights a card covers
// ============================================
// docs/transport-zones/PLAN.md step 4 (owner decisions D1–D10, 2026-11-16).
//
// PICKUP ZONE. A transfer or day tour is priced for the area of the city the
// guests' hotel is in (a 6th of October hotel, a West Bank hotel). The area
// comes from the hotel the engine chose for that city: the night the guests
// arrive at it, or the night they woke up in it. A day states its own pickup
// area when it has no hotel there (a cruise day, a hotel-less quote) — D9.
// No hotel night in the city and nothing stated → the city's default area.
//
// SIGHTS. A sightseeing card may list the sights it covers (Luxor East Bank:
// Karnak, Luxor Temple). Among a lookup's cards that list sights, the one
// covering EVERY sight of the day with the FEWEST sights wins — East Bank
// for Karnak alone, East & West Bank for Karnak and the Valley of the Kings
// (D4). Equally small → the starred one, else the cheapest with a warning
// (D8). None covers → a card that lists no sights, priced as before; none of
// those either → a gap naming the sights, never a guess.
//
// Pure: the engine and its tests share it.

import type { RouteChoice } from '@/lib/pricing/transport-suppliers'

export interface ZoneDay {
  city: string
  accommodation_type?: string | null
  /** The day's own pickup area (a zone key), when it states one. */
  pickup_zone?: string | null
}

/**
 * The area a transport line on `days[index]` in `city` is picked up in.
 * `hotelZoneIn(city)` is the area of the hotel the engine chose there.
 * null = the city's default area.
 */
export function pickupZoneFor(
  days: readonly ZoneDay[],
  index: number,
  city: string | null | undefined,
  hotelZoneIn: (city: string) => string | null | undefined,
): string | null {
  const day = days[index]
  const where = String(city ?? '').trim().toLowerCase()
  if (!day || !where) return null
  const sameCity = (d: ZoneDay | undefined) => !!d && d.city.trim().toLowerCase() === where
  if (day.pickup_zone && sameCity(day)) return day.pickup_zone
  const hotelNight = (d: ZoneDay | undefined) => sameCity(d) && d!.accommodation_type === 'hotel'
  // Tonight's hotel (arriving at it), or last night's (setting out from it).
  if (hotelNight(day) || hotelNight(days[index - 1])) return hotelZoneIn(String(city)) || null
  return null
}

export interface SightCard {
  route_name?: string | null
  base_rate_eur?: number | string | null
  is_preferred?: boolean | null
  covers_sights?: readonly string[] | null
}

export type SightChoice<T> =
  | { kind: 'card'; card: T; routeChoice?: RouteChoice }
  | { kind: 'uncovered'; cards: string[] }

const lower = (s: string) => s.trim().toLowerCase()
const name = (c: SightCard) => String(c.route_name ?? '').trim()
const price = (c: SightCard) => { const n = Number(c.base_rate_eur); return Number.isFinite(n) ? n : Infinity }

/** Starred if exactly one is, else the cheapest — with the choice recorded when it was a choice. */
function starredOrCheapest<T extends SightCard>(pool: readonly T[]): { card: T; routeChoice?: RouteChoice } {
  const starred = pool.filter(c => c.is_preferred === true)
  const from = starred.length > 0 ? starred : pool
  const card = [...from].sort((a, b) => price(a) - price(b) || name(a).localeCompare(name(b)))[0]
  const names = [...new Set(pool.map(name))]
  if (names.length < 2 || new Set(starred.map(name)).size === 1) return { card }
  return { card, routeChoice: { chosen: name(card), others: names.filter(n => n !== name(card)), amongStarred: starred.length > 0 } }
}

/**
 * The card for a day's sights, among one lookup's cards (same service, city,
 * area, vehicle). Only called when at least one of them lists sights.
 */
export function chooseCardForSights<T extends SightCard>(cards: readonly T[], daySights: readonly string[]): SightChoice<T> {
  const want = [...new Set(daySights.map(lower).filter(Boolean))]
  const listing = cards.filter(c => (c.covers_sights?.length ?? 0) > 0)
  const plain = cards.filter(c => (c.covers_sights?.length ?? 0) === 0)
  // A day with no sights is a transfer, not a sightseeing package.
  if (want.length > 0) {
    const covering = listing.filter(c => {
      const has = new Set((c.covers_sights ?? []).map(lower))
      return want.every(s => has.has(s))
    })
    if (covering.length > 0) {
      const fewest = Math.min(...covering.map(c => c.covers_sights!.length))
      return { kind: 'card', ...starredOrCheapest(covering.filter(c => c.covers_sights!.length === fewest)) }
    }
  }
  if (plain.length > 0) return { kind: 'card', ...starredOrCheapest(plain) }
  if (want.length === 0) return { kind: 'card', ...starredOrCheapest(listing) }
  return { kind: 'uncovered', cards: [...new Set(listing.map(name))] }
}

/** The gap for a day whose sights no card covers. */
export function uncoveredSightsMessage(day: number, what: string, sights: readonly string[], cards: readonly string[]): string {
  return `Day ${day}: no ${what} card covers ${sights.join(' + ')} (cards: ${cards.join(', ')}). Add a card that covers them, or add the sight to a card's "Sights covered", in Rates → Transportation.`
}
