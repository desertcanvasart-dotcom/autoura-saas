// ============================================
// Airport → tour → airport: a layover tour, not a transfer
// ============================================
// Agencies sell a route for travellers in transit: met at the airport, a
// full (or half) day touring, back to the airport for the onward flight
// ("Airport → Full Day → Airport (Sphinx)"). It is saved as an airport
// transfer — rightly, it starts and ends there — but it is not the plain
// airport ↔ hotel transfer, and an arrival day must not be priced with it.
// Told apart by its name: an airport route that also says it tours.

export interface RouteLike {
  route_name?: string | null
  service_type?: string | null
  city?: string | null
  origin_city?: string | null
  destination_city?: string | null
}

const AIRPORT = /\bairport\b|\b(cai|hbe|lxr|asw|hrg|ssh|rmf|spx)\b/i
const TOURS = /\b(full[\s-]?day|half[\s-]?day|day[\s-]?tour|tour|layover|transit|stopover|sightseeing)\b/i

/** An airport route whose name says it also tours (a layover tour). */
export function isLayoverRoute(r: RouteLike): boolean {
  const name = String(r.route_name ?? '')
  if (!TOURS.test(name)) return false
  return AIRPORT.test(name) || AIRPORT.test([r.origin_city, r.destination_city].filter(Boolean).join(' '))
}

/** The itinerary itself is a layover: the party is in transit, not staying. */
export const LAYOVER_TEXT = /\b(layover|lay-over|stopover|stop-over|in transit|transit (tour|passengers?|day))\b/i

export interface TransportRowLike extends RouteLike {
  id: string
  vehicle_type?: string | null
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/**
 * The plain airport transfer to use instead of a layover tour: same city,
 * same vehicle when there is one. Null when the agency has no plain transfer
 * there — the operator then picks one.
 */
export function plainTransferFor<T extends TransportRowLike>(layover: T, rows: T[]): T | null {
  const city = norm(layover.city || layover.origin_city)
  const plain = rows.filter(r =>
    r.service_type === 'airport_transfer' && !isLayoverRoute(r) &&
    (norm(r.city) === city || norm(r.origin_city) === city))
  return plain.find(r => norm(r.vehicle_type) === norm(layover.vehicle_type)) ?? plain[0] ?? null
}
