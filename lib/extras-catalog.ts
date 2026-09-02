// ============================================
// The option catalogue — what can be added to a trip
// ============================================
// Ported verbatim from travel-ops-pro (lib/extras-catalog.ts).
//
// An extra typed by hand works, but it drifts: two agents name the same tour
// differently, the price is whatever was remembered, no supplier cost comes
// with it (so the P&L reads the whole thing as margin), and nobody can ever
// ask "how much did the balloon ride earn us this year".
//
// So extras are PICKED from a list, and the list is one the operator already
// maintains:
//
//   PACKAGE OPTIONS   tour_variation_services where is_optional — the options
//                     belonging to a specific programme, each with its own
//                     cost_per_unit and an optional_price_override that is the
//                     selling price the operator already decided on.
//   ATTRACTION EXTRAS entrance_fees where is_sellable_extra — a site the
//                     customer can pay to add. NOT is_addon: that flag means
//                     "leave out of the automatic price", a different decision.
//   CATALOGUE EXTRAS  extras_catalogue — the things that are not attractions
//                     at all: airport fast-track, extra luggage, late check-out.
//
// THE PICKER PRE-FILLS, IT DOES NOT COMMIT. Every price here is a suggestion
// the office can change before the extra is offered, which is why an honest
// null is better than a plausible number: what cannot be priced comes back
// unpriced and says why.

import { usableRate } from '@/lib/pricing/usable-rate'
import { roundToCurrency } from '@/lib/currency-totals'

export type CatalogSourceKind = 'package_option' | 'entrance_fee' | 'catalogue_extra'

export interface CatalogItem {
  source_kind: CatalogSourceKind
  source_id: string
  title: string
  /** Where it comes from and how it was priced, in the office's words. */
  subtitle: string | null
  supplier_id: string | null
  /** What we pay. Null is a hole in the rate table, never zero. */
  supplier_cost: number | null
  supplier_currency: string | null
  /** What to charge, in the BOOKING's currency. Null = the office prices it. */
  unit_price: number | null
  currency: string
  price_note: string
}

/** Convert between currencies, or null when there is no rate to do it with. */
export type Converter = (amount: number, from: string, to: string) => number | null

export interface PriceCatalogItemInput {
  /** cost_per_unit / eur_rate / non_eur_rate — whatever the rate table holds. */
  cost: unknown
  /** A selling price the operator already set (optional_price_override). */
  sellingOverride?: unknown
  marginPercent: number
  /** The currency the RATE is in — the tenant's rate currency. */
  rateCurrency: string
  /** The currency the customer is billed in. */
  bookingCurrency: string
  convert: Converter
}

export interface PricedCatalogItem {
  supplier_cost: number | null
  supplier_currency: string | null
  unit_price: number | null
  price_note: string
}

/**
 * What to charge for one catalogue row, and what it costs us.
 *
 * Three ways it can land, and the note says which:
 *   override  the operator already decided this option's selling price
 *   margin    cost plus the tenant's margin
 *   unpriced  no usable rate, or no way to convert it — the office types it
 *
 * A blank or zero rate is a HOLE, not a free service: usableRate() rejects it,
 * and the item comes back unpriced rather than offering something for nothing.
 */
export function priceCatalogItem(input: PriceCatalogItemInput): PricedCatalogItem {
  const { rateCurrency, bookingCurrency, marginPercent } = input
  const cost = usableRate(input.cost)
  const override = usableRate(input.sellingOverride)

  const toBooking = (amount: number): number | null => {
    if (normalise(rateCurrency) === normalise(bookingCurrency)) return amount
    const converted = input.convert(amount, rateCurrency, bookingCurrency)
    return converted == null ? null : converted
  }

  const supplier_cost = cost
  const supplier_currency = cost == null ? null : rateCurrency

  if (override != null) {
    const price = toBooking(override)
    return price == null
      ? { supplier_cost, supplier_currency, unit_price: null, price_note: noRateNote(rateCurrency, bookingCurrency) }
      : {
          supplier_cost,
          supplier_currency,
          unit_price: roundToCurrency(price, bookingCurrency),
          price_note: `the price set on this option${conversionSuffix(rateCurrency, bookingCurrency)}`,
        }
  }

  if (cost == null) {
    return {
      supplier_cost: null,
      supplier_currency: null,
      unit_price: null,
      price_note: 'no rate on file — set the price before offering it',
    }
  }

  const withMargin = cost * (1 + marginPercent / 100)
  const price = toBooking(withMargin)
  if (price == null) {
    return { supplier_cost, supplier_currency, unit_price: null, price_note: noRateNote(rateCurrency, bookingCurrency) }
  }

  return {
    supplier_cost,
    supplier_currency,
    unit_price: roundToCurrency(price, bookingCurrency),
    price_note: `cost + ${marginPercent}% margin${conversionSuffix(rateCurrency, bookingCurrency)}`,
  }
}

/**
 * Which of an entrance fee's two rates to pre-fill with.
 *
 * The rate tables price by passport, and a booking does not record passport
 * type — so this picks the non-EUR rate, which is the one most travellers pay,
 * and SAYS SO. The office sees the basis and can change the number before the
 * option is offered; what it must never do is present one passport's price as
 * though it were the only one.
 */
export function entranceFeeBasis(row: { non_eur_rate?: unknown; eur_rate?: unknown }): {
  cost: number | null
  basis: string | null
} {
  const nonEur = usableRate(row.non_eur_rate)
  if (nonEur != null) return { cost: nonEur, basis: 'non-EUR passport rate' }
  const eur = usableRate(row.eur_rate)
  if (eur != null) return { cost: eur, basis: 'EUR passport rate' }
  return { cost: null, basis: null }
}

function noRateNote(from: string, to: string): string {
  return `no exchange rate for ${normalise(from)} → ${normalise(to)} — set the price yourself`
}

function conversionSuffix(from: string, to: string): string {
  return normalise(from) === normalise(to) ? '' : `, converted from ${normalise(from)}`
}

function normalise(currency: unknown): string {
  const s = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}
