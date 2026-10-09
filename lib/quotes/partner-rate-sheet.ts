import { currencyDecimals } from '@/lib/currency-totals'

/**
 * The single supplement a partner is quoted. Quotes priced by the engine
 * (from an itinerary, the calculator) store the supplement at NET cost with
 * the quote's margin beside it, so the partner price is the cost plus that
 * margin — printing the stored figure quoted singles at cost. A quote with no
 * margin recorded (entered by hand) carries the price the operator typed.
 */
export function partnerSingleSupplement(quote: {
  single_supplement?: unknown
  margin_percent?: unknown
  currency?: unknown
}): number {
  const net = Number(quote.single_supplement)
  if (!Number.isFinite(net) || net <= 0) return 0
  const margin = quote.margin_percent == null ? NaN : Number(quote.margin_percent)
  if (!Number.isFinite(margin)) return net
  const factor = 10 ** currencyDecimals(String(quote.currency ?? 'EUR').toUpperCase())
  return Math.round(net * (1 + margin / 100) * factor) / factor
}
