// ============================================
// Rates saved under the wrong category
// ============================================
// The parser and the pricing grid trust a rate's tier and type: a luxury
// trip only offers hotels saved as luxury, and a transfer from the airport
// is priced from rates typed as airport transfers. A rate saved under the
// wrong one (the hotel form defaults new hotels to Standard; a "Cairo
// Airport" route saved as Full Day) silently gives the wrong hotel or the
// wrong transport. These checks list the likely ones, for the operator to
// fix in Rates — nothing here changes a rate.

import { isLayoverRoute } from './layover-route'

export interface HotelCheckRow {
  id: string
  property_name?: string | null
  hotel_name?: string | null
  city?: string | null
  tier?: string | null
  star_rating?: number | null
}

export interface TransportCheckRow {
  id: string
  route_name?: string | null
  service_type?: string | null
  vehicle_type?: string | null
  city?: string | null
  origin_city?: string | null
  destination_city?: string | null
}

export interface RateFinding {
  /** Ids of every rate row the finding covers (one hotel has a row per room type). */
  ids: string[]
  name: string
  city: string
  current: string
  expected: string
  reason: string
}

const RANK: Record<string, number> = { budget: 1, standard: 2, deluxe: 3, luxury: 4 }

/** The tiers a hotel of this star rating normally sits in. */
function tiersForStars(stars: number): string[] {
  if (stars >= 5) return ['deluxe', 'luxury']
  if (stars >= 4) return ['standard', 'deluxe']
  return ['budget', 'standard']
}

const key = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/**
 * Hotels whose tier does not fit their star rating (a 5★ saved as Standard,
 * a 3★ saved as Luxury). One finding per hotel, not per room type. Hotels
 * with no star rating, or on a tier the agency named itself, can't be judged.
 */
export function hotelTierFindings(rows: HotelCheckRow[]): RateFinding[] {
  const groups = new Map<string, { rows: HotelCheckRow[]; name: string; city: string }>()
  for (const r of rows) {
    const name = String(r.property_name || r.hotel_name || '').trim()
    if (!name) continue
    const k = `${key(name)}|${key(r.city)}|${key(r.tier)}`
    const g = groups.get(k)
    if (g) g.rows.push(r)
    else groups.set(k, { rows: [r], name, city: String(r.city ?? '') })
  }
  const out: RateFinding[] = []
  for (const g of groups.values()) {
    const tier = key(g.rows[0].tier)
    if (!(tier in RANK)) continue
    const stars = Math.max(0, ...g.rows.map(r => Number(r.star_rating) || 0))
    if (stars < 1) continue
    const expected = tiersForStars(stars)
    if (expected.includes(tier)) continue
    out.push({
      ids: g.rows.map(r => r.id),
      name: g.name,
      city: g.city,
      current: tier,
      expected: expected.join(' or '),
      reason: `${stars}★ hotel saved as ${tier}`,
    })
  }
  return out.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
}

const AIRPORT = /\bairport\b|\b(cai|hbe|lxr|asw|hrg|ssh|rmf|spx)\b/i
const FULL_DAY = /\bfull[\s-]?day\b/i
const HALF_DAY = /\bhalf[\s-]?day\b/i

const pretty = (s: string) => s.replace(/_/g, ' ')

/**
 * Transport whose type contradicts its route or name: an airport route not
 * typed as an airport transfer, or a route named "Full day" / "Half day"
 * typed as something else. Layover tours (airport → tour → airport) are
 * left alone. One finding per route (a row per vehicle).
 */
export function transportTypeFindings(rows: TransportCheckRow[]): RateFinding[] {
  const groups = new Map<string, TransportCheckRow[]>()
  for (const r of rows) {
    const k = [r.route_name, r.service_type, r.city, r.origin_city, r.destination_city].map(key).join('|')
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: RateFinding[] = []
  for (const g of groups.values()) {
    const r = g[0]
    const type = key(r.service_type)
    // Airport → Full Day → Airport is a layover tour: saved as an airport
    // transfer or as a day tour, either is right — neither is a mistake.
    if (!type || isLayoverRoute(r)) continue
    const name = String(r.route_name || [r.origin_city || r.city, r.destination_city].filter(Boolean).join(' → ') || '').trim()
    const where = [r.origin_city, r.destination_city, r.city].filter(Boolean).join(' ')
    const finding = (expected: string, reason: string) => out.push({
      ids: g.map(x => x.id), name, city: String(r.city || r.origin_city || ''), current: pretty(type), expected, reason,
    })
    if (type !== 'airport_transfer' && (AIRPORT.test(where) || AIRPORT.test(r.route_name ?? ''))) {
      finding('airport transfer', `airport route saved as ${pretty(type)}`)
    } else if (FULL_DAY.test(r.route_name ?? '') && (type.includes('half') || !/full|day_tour|day_trip/.test(type))) {
      finding('full day', `named "Full day" but saved as ${pretty(type)}`)
    } else if (HALF_DAY.test(r.route_name ?? '') && !type.includes('half')) {
      finding('half day', `named "Half day" but saved as ${pretty(type)}`)
    }
  }
  return out.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
}
