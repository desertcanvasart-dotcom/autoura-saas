// ============================================
// A grid line priced by its own rate's basis
// ============================================
// The grid used to price every line by the ROW it sits in: group rows once,
// per-person rows × pax. But airport / hotel assistance can be priced per
// person or per unit (migration 393), and an activity says so itself
// (activity_rates.pricing_type) — a private felucca is one price for the boat,
// a camel ride is per person, whichever row it sits in.
//
// For these rows each item now follows its own basis
// (lib/pricing/pricing-basis.ts). An item without one — an older selection,
// a rate row that states nothing — keeps its row's rule, so nothing moves
// until a rate says otherwise. The calculator and the save share this, so the
// grid saves what it priced.

import { priceByBasis, type PricingBasis } from '@/lib/pricing/pricing-basis'

/** Rows whose items carry their own basis. */
export const BASIS_SLOTS: ReadonlySet<string> = new Set(['airport_services', 'hotel_services', 'boat_rides', 'experiences'])

/** The row's own rule, for an item that states no basis. */
export function rowBasis(slotId: string): PricingBasis {
  return slotId === 'experiences' ? 'per_person' : 'flat'
}

interface BasisItem {
  rateEur?: number
  rateNonEur?: number
  pricingBasis?: PricingBasis
  unitCapacity?: number | null
}

export function itemBasis(slotId: string, item: BasisItem): PricingBasis {
  return item.pricingBasis ?? rowBasis(slotId)
}

/**
 * One item's cost for a group of `pax`, split the calculator's way: `group`
 * is charged once for the group (per group, per unit), `perPerson` is per
 * traveller. `quantity` / `lineTotal` are what the save stores.
 */
export function itemCost(slotId: string, item: BasisItem, rate: number, pax: number) {
  const basis = itemBasis(slotId, item)
  const line = priceByBasis(rate, basis, pax, item.unitCapacity)
  return {
    basis,
    group: line.isPerPax ? 0 : line.lineTotal,
    perPerson: line.isPerPax ? rate : 0,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
  }
}
