// ============================================
// What an optional service adds to a quote
// ============================================
// Ported verbatim from travel-ops-pro (lib/b2b/optional-pricing.ts) so both
// apps spell "a priced option on a variation" the same way: an optional
// service line (tour_variation_services.is_optional) with a cost and, when
// the operator has decided one, an optional_price_override.
//
// Decided 2026-08-28 (sibling): options are priced OFF-MARGIN. When the
// operator has set a price for an option, that is the price. A margin
// percentage must not quietly restate it — that is how the same balloon ride
// came out at 125 before the sale and 140 after it.
//
// So a chosen option lands in one of two places:
//
//   NO OVERRIDE   its cost joins the margin base and is marked up like every
//                 other service. An option is just a service nobody has priced
//                 separately.
//   OVERRIDE      its price is added AFTER margin, untouched. Its cost is still
//                 counted as cost, because we still pay it — leaving it out
//                 would report the option as pure profit.

import { usableRate } from '@/lib/pricing/usable-rate'

export type QuantityMode = 'per_pax' | 'per_group' | 'fixed' | 'per_day' | 'per_night' | 'per_room' | string

/**
 * How many units of a service a trip buys.
 *
 * One function for both the displayed quantity and the line total, so a
 * per-night line can never report a quantity that disagrees with its own
 * total.
 */
export function serviceQuantity(input: {
  quantityMode: QuantityMode
  quantityValue: unknown
  numPax: number
  durationDays: number
}): number {
  const value = Number(input.quantityValue) || 1
  const pax = Math.max(1, Math.floor(Number(input.numPax)) || 1)
  const days = Math.max(1, Math.floor(Number(input.durationDays)) || 1)

  switch (input.quantityMode) {
    case 'per_pax':
      return value * pax
    case 'per_day':
      return value * days
    case 'per_night':
      // A trip of N days has N-1 nights, and a single-day trip has none — but a
      // quantity of zero would price the line at nothing, so it floors at one.
      return value * Math.max(1, days - 1)
    case 'per_room':
      return Math.ceil(pax / 2)
    case 'per_group':
    case 'fixed':
    default:
      return value
  }
}

export interface OptionalContribution {
  /** Cost that joins the margin base. */
  marginable: number
  /** Selling price added after margin, untouched by it. */
  fixedPrice: number
  /** What we pay for it either way. */
  cost: number
}

/**
 * Where one CHOSEN optional service's money goes.
 *
 * A zero or blank override is not a price — usableRate rejects it — so the
 * option falls back to cost + margin rather than being given away.
 */
export function optionalContribution(input: {
  lineTotal: unknown
  override: unknown
  quantity: number
}): OptionalContribution {
  const cost = Number(input.lineTotal)
  const safeCost = Number.isFinite(cost) ? cost : 0
  const override = usableRate(input.override)
  const quantity = Math.max(1, Math.floor(Number(input.quantity)) || 1)

  if (override == null) return { marginable: safeCost, fixedPrice: 0, cost: safeCost }
  return { marginable: 0, fixedPrice: override * quantity, cost: safeCost }
}

export interface QuoteTotals {
  /** What the trip costs us, options included. */
  costTotal: number
  /** The part of the cost that margin is taken on. */
  marginBase: number
  marginAmount: number
  /** Before any seasonal premium. */
  baseSellingPrice: number
  /** What the chosen options add to the selling price, both kinds together. */
  optionalSellingTotal: number
}

/**
 * The quote's totals, once the chosen options are known.
 *
 * `costTotal` stays a COST — it is what the itinerary stores as supplier_cost
 * at conversion — so an option priced off-margin contributes its cost here and
 * its price to baseSellingPrice, never the same number to both.
 */
export function composeQuoteTotals(input: {
  /** Σ line totals of the non-optional services. */
  subtotalCost: number
  /** One entry per CHOSEN optional service. */
  optionals: OptionalContribution[]
  marginPercent: number
}): QuoteTotals {
  const subtotal = Number(input.subtotalCost) || 0
  const margin = Number(input.marginPercent) || 0

  let marginableOptions = 0
  let fixedPrice = 0
  let optionCost = 0
  for (const o of input.optionals) {
    marginableOptions += o.marginable
    fixedPrice += o.fixedPrice
    optionCost += o.cost
  }

  const marginBase = subtotal + marginableOptions
  const marginAmount = marginBase * (margin / 100)

  return {
    costTotal: round(subtotal + optionCost),
    marginBase: round(marginBase),
    marginAmount: round(marginAmount),
    baseSellingPrice: round(marginBase + marginAmount + fixedPrice),
    optionalSellingTotal: round(marginableOptions * (1 + margin / 100) + fixedPrice),
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
