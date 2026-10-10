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

import { roundToCurrency } from '@/lib/currency-totals'

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

/** One service's client price: an explicit client_price wins, else cost × (1 + margin). */
export function serviceClientPrice(s: PricedService, marginPercent: unknown): number {
  const supplier = Number(s.total_cost) || 0
  return s.client_price != null ? Number(s.client_price) : supplier * (1 + resolveItineraryMargin(marginPercent) / 100)
}

/** Sum of per-service client prices (serviceClientPrice). Rounded to cents. */
export function itineraryClientTotal(services: PricedService[], marginPercent: unknown): number {
  let total = 0
  for (const s of services) total += serviceClientPrice(s, marginPercent)
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

/**
 * The trip total plus the confirmed extras on its live booking(s): the share
 * page showed the itinerary's total only, so a traveller who had added a
 * balloon ride saw a price that left it out (documents audit, round 12).
 * bookings.extras_total is already the CONFIRMED extras, in the booking's
 * currency; a booking in another currency is not added to this one.
 */
export function totalWithBookingExtras(
  total: unknown,
  currency: string | null | undefined,
  bookings: Array<{ status?: string | null; currency?: string | null; extras_total?: unknown }> | null | undefined
): number {
  const code = String(currency || 'EUR').toUpperCase()
  let sum = Number(total) || 0
  // No trip price, no total: the extras alone are not the trip's price.
  if (!(sum > 0)) return sum
  for (const b of bookings ?? []) {
    if (String(b.status || '').toLowerCase() === 'cancelled') continue
    if (String(b.currency || code).toUpperCase() !== code) continue
    sum += Number(b.extras_total) || 0
  }
  return roundToCurrency(sum, code)
}
