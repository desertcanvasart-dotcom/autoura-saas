// ============================================================================
// The client-facing total of an itinerary — one implementation.
// ============================================================================
// The itinerary page computed this in the component, and the email route then
// trusted whatever number the browser sent. It arrived as a STRING
// (`toFixed(2)`), which the deliverable-price gate rejects (Number.isFinite of
// a string is false) — so "Send email" failed with 422 on every itinerary. The
// page and the route now share this, and the route recomputes from the
// database instead of accepting a total from the request.
//
// itinerary.total_cost is a denormalized cache that can be 0 or stale; the
// services are the source of truth whenever any exist.

export interface PricedService {
  total_cost: number | string | null
  client_price?: number | string | null
}

/**
 * The itinerary's margin. A nullable column where 0 is a real margin (an
 * at-cost trip): null/undefined/'' must be caught BEFORE Number(), because
 * Number(null) === 0 would sell a trip with no margin set AT COST.
 */
export function resolveItineraryMargin(marginPercent: unknown): number {
  if (marginPercent === null || marginPercent === undefined || marginPercent === '') return 25
  const raw = Number(marginPercent)
  return Number.isFinite(raw) ? raw : 25
}

/** Sum of per-service client prices: an explicit client_price wins, else cost × (1 + margin). Rounded to cents. */
export function itineraryClientTotal(services: PricedService[], marginPercent: unknown): number {
  const margin = resolveItineraryMargin(marginPercent)
  let total = 0
  for (const s of services) {
    const supplier = Number(s.total_cost) || 0
    total += s.client_price != null ? Number(s.client_price) : supplier * (1 + margin / 100)
  }
  return Math.round(total * 100) / 100
}

/** What the header, invoice and client email show: the services' total when positive, else the stored total_cost. */
export function effectiveItineraryTotal(
  itinerary: { total_cost: number | string | null; margin_percent: unknown },
  services: PricedService[]
): number {
  const computed = itineraryClientTotal(services, itinerary.margin_percent)
  return computed > 0 ? computed : Number(itinerary.total_cost) || 0
}
