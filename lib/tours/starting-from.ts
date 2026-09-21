// ============================================
// A tour's "starting from" price
// ============================================
// One definition, so the figure on a tour card cannot mean two things:
//
//   1. the engine's lowest COMPLETE tier price, for a tour that has days —
//      never an estimate built on a missing or approximate rate;
//   2. otherwise a manually entered variation price (the legacy table);
//   3. otherwise nothing. There is no invented figure: this used to fall back
//      to `duration_days * 150`, and that made-up number was the only price
//      the tours page ever showed.
//
// A nonsense number (Infinity/NaN from a broken rate, zero, negative) is
// nothing too — the tour is still listed, without a price.
//
// Server-only: it reaches the pricing engine. The tours page gets the result
// from /api/tours/browse/prices, AFTER the list has been shown.

import { getTemplatePriceRange } from '@/lib/auto-pricing-service'

export interface StartingFrom { starting_from: number | null; starting_from_tier: string | null }

export const NO_PRICE: StartingFrom = { starting_from: null, starting_from_tier: null }

export interface PricedTemplate {
  id: string
  tenant_id: string
  itinerary?: unknown
  tour_variations?: Array<{ id: string; is_active?: boolean | null }> | null
}

/** The legacy reader: the cheapest manual price among these variations. */
export type ManualPriceReader = (variationIds: string[]) => Promise<number | null>

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export function dayCountOf(template: { itinerary?: unknown }): number {
  return Array.isArray(template.itinerary) ? template.itinerary.length : 0
}

export async function startingFromFor(template: PricedTemplate, readManualPrice: ManualPriceReader): Promise<StartingFrom> {
  // Every tour with days is priced — what decides is what the engine prices
  // FROM, not a flag on the template (#484).
  if (dayCountOf(template) > 0) {
    const range = await getTemplatePriceRange(template.id, template.tenant_id)
    if (range && usable(range.minPrice)) return { starting_from: range.minPrice, starting_from_tier: range.tier }
  }
  const variationIds = (template.tour_variations ?? []).filter(v => v.is_active).map(v => v.id)
  if (variationIds.length > 0) {
    const manual = await readManualPrice(variationIds)
    if (usable(manual)) return { starting_from: manual, starting_from_tier: null }
  }
  return NO_PRICE
}
