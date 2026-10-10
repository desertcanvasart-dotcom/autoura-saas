// ============================================
// A confirmed extra's supplier cost, in the booking's currency
// ============================================
// booking_supplier_status.quoted_cost has no currency of its own: it is read
// — and expensed (lib/bookings/supplier-expense) — in the BOOKING's currency.
// An extra's supplier cost of EGP 150 on a yen booking went in as ¥150
// (documents audit, round 12). Converted at the run rates; with no rate, the
// cost is left blank and the manifest line says what it was rather than state
// a wrong figure. Pure: the extras route and the tests share it.

import { convertCurrency, type ExchangeRate } from '@/lib/currency'
import { roundToCurrency } from '@/lib/currency-totals'

export interface ManifestCost {
  quotedCost: number | null
  /** Appended to the manifest line when the cost was in another currency. */
  note: string
}

export function manifestCost(
  extra: { supplier_cost?: unknown; supplier_currency?: unknown; currency?: unknown },
  bookingCurrency: unknown,
  rates: ExchangeRate[]
): ManifestCost {
  const to = String(bookingCurrency || 'EUR').toUpperCase()
  const raw = extra.supplier_cost
  const cost = raw == null || raw === '' ? null : Number(raw)
  if (cost == null || !Number.isFinite(cost)) return { quotedCost: null, note: '' }
  const from = String(extra.supplier_currency || extra.currency || to).toUpperCase()
  if (from === to) return { quotedCost: cost, note: '' }
  const converted = convertCurrency(cost, from, to, rates)
  return converted == null
    ? { quotedCost: null, note: ` (supplier cost ${from} ${cost} — no ${to} rate, enter it by hand)` }
    : { quotedCost: roundToCurrency(converted, to), note: ` (supplier cost ${from} ${cost})` }
}
