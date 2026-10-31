// ============================================
// What the markup setting means, in numbers
// ============================================
// The engine sells at cost × (1 + markup) everywhere
// (app/pricing-grid/lib/calculator.ts, lib/pricing/pax-range.ts,
// lib/quotes/b2c-quote-price.ts …) — a MARKUP on supplier cost, not a margin
// on the selling price. Settings › Pricing defaults labels it so and shows
// what it comes to. Display only: nothing here prices anything.

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** Selling price for a cost at a markup (percent). */
export function sellingPrice(cost: number, markupPercent: number): number {
  return cost * (1 + markupPercent / 100)
}

/** The profit margin, as a percent of the selling price, a markup gives. */
export function marginFromMarkup(markupPercent: number): number {
  return (markupPercent / (100 + markupPercent)) * 100
}

/** The markup needed for a margin (percent of the selling price). null at 100% or more. */
export function markupForMargin(marginPercent: number): number | null {
  if (marginPercent >= 100) return null
  return (marginPercent / (100 - marginPercent)) * 100
}

/** "20", "21.6", "37.9": one decimal, none when whole. */
export function pct(n: number): string {
  const r = round(n, 1)
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * Seasonal premiums sit after the markup, on the selling price
 * (lib/pricing/season-uplift.ts); where date windows overlap, the highest
 * premium applies — they do not add up.
 */
export const SEASON_FORMULA = 'peak-date price = selling price × (1 + premium)'

/** A price shown in another currency, with the conversion buffer (display only). */
export function displayWithBuffer(amount: number, rate: number, bufferPercent: number): number {
  return amount * rate * (1 + bufferPercent / 100)
}
