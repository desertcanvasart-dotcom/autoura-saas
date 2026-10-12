// ============================================================================
// A B2C quote's price — worked out on the server, never taken from the body
// ============================================================================
// The routes stored the selling price and price per person the browser sent,
// and recomputed them unrounded when they did (¥33,333.33 a head). The base
// cost and margin are the operator's inputs; everything derived from them is
// computed here, in the currency's own units (whole yen). The edit page's
// preview uses the same function, so it shows what is saved.

import { roundToCurrency } from '@/lib/currency-totals'
import { MARGIN_MAX, MARGIN_MIN } from '@/lib/pricing-guards'

export interface B2cQuotePrice {
  selling_price: number
  price_per_person: number
  /** The demand-calendar premium inside selling_price (0 on an ordinary date). */
  season_premium: number
}

/**
 * The seasonal premium on a selling price (Settings → Seasonal Premiums):
 * a percentage of the price AFTER margin, in the currency's units — the same
 * rule as the B2B Calculator (lib/pricing/season-uplift.ts).
 */
export function withSeasonPremium(
  sellingBeforeSeason: number,
  seasonPercent: unknown,
  travelers: unknown,
  currency: string | null | undefined,
): B2cQuotePrice {
  const cur = currency || 'EUR'
  const pct = Math.max(0, Number(seasonPercent) || 0)
  const base = roundToCurrency(Math.max(0, sellingBeforeSeason), cur)
  const premium = pct > 0 ? roundToCurrency((base * pct) / 100, cur) : 0
  const selling = roundToCurrency(base + premium, cur)
  const pax = Math.max(1, Math.floor(Number(travelers) || 1))
  return { selling_price: selling, price_per_person: roundToCurrency(selling / pax, cur), season_premium: premium }
}

export function priceB2cQuote(input: {
  totalCost: unknown
  marginPercent: unknown
  travelers: unknown
  currency: string | null | undefined
  /** The departure's seasonal premium, % of the price after margin. */
  seasonPercent?: unknown
}): B2cQuotePrice {
  const currency = input.currency || 'EUR'
  const cost = Math.max(0, Number(input.totalCost) || 0)
  const margin = Number(input.marginPercent) || 0
  return withSeasonPremium(cost * (1 + margin / 100), input.seasonPercent, input.travelers, currency)
}

/** Why a base cost / margin pair cannot be priced, or null. */
export function b2cPriceInputError(totalCost: unknown, marginPercent: unknown): string | null {
  const cost = Number(totalCost)
  if (!Number.isFinite(cost) || cost <= 0) return 'The base cost must be a positive amount'
  const margin = Number(marginPercent)
  if (!Number.isFinite(margin) || margin < MARGIN_MIN || margin > MARGIN_MAX) {
    return `The margin must be between ${MARGIN_MIN}% and ${MARGIN_MAX}%`
  }
  return null
}
