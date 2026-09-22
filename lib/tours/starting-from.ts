// ============================================
// A tour's "starting from" price
// ============================================
// One definition, so the figure on a tour card cannot mean two things:
//
//   1. the engine's cheapest COMPLETE tier price, for a tour that has days —
//      never an estimate built on a missing or approximate rate;
//   2. otherwise the tier missing the FEWEST services, shown marked incomplete
//      with that count (sibling #461) — so a tour whose rates are half-entered
//      still shows a figure the operator can read, honestly flagged, rather
//      than nothing at all;
//   3. otherwise a manually entered variation price (the legacy table);
//   4. otherwise nothing. There is no invented figure: this used to fall back
//      to `duration_days * 150`, and that made-up number was the only price
//      the tours page ever showed.
//
// A nonsense number (Infinity/NaN from a broken rate, zero, negative) is
// nothing too — the tour is still listed, without a price.
//
// Server-only: it reaches the pricing engine. The tours page gets the result
// from /api/tours/browse/prices, AFTER the list has been shown.

import { getTemplateStartingPrice } from '@/lib/auto-pricing-service'

export interface StartingFrom {
  starting_from: number | null
  starting_from_tier: string | null
  /** false when the figure comes from a tier that could not price every
   *  service (an incomplete price), so the card can mark it. */
  complete: boolean
  /** Services the chosen tier could not price; 0 when complete. */
  gaps: number
}

export const NO_PRICE: StartingFrom = { starting_from: null, starting_from_tier: null, complete: false, gaps: 0 }

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
    const p = await getTemplateStartingPrice(template.id, template.tenant_id)
    if (p && usable(p.minPrice)) {
      return { starting_from: p.minPrice, starting_from_tier: p.tier, complete: p.complete, gaps: p.gaps }
    }
  }
  const variationIds = (template.tour_variations ?? []).filter(v => v.is_active).map(v => v.id)
  if (variationIds.length > 0) {
    const manual = await readManualPrice(variationIds)
    // A manually entered price is a whole price — the operator set it.
    if (usable(manual)) return { starting_from: manual, starting_from_tier: null, complete: true, gaps: 0 }
  }
  return NO_PRICE
}
