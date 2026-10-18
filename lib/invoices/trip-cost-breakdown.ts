// ============================================
// A deposit / final invoice's trip cost breakdown
// ============================================
// One implementation for the invoice PDF and the office invoice page: the page
// worked its own figures back (a final invoice from the deposit's total, or
// from its own total with the extras in it) and printed them with two
// decimals, so it disagreed with the PDF — and showed yen as ¥123,456.67
// (documents audit, round 12).

import { roundToCurrency } from '@/lib/currency-totals'

export interface TripCostInput {
  invoiceType: string
  totalAmount: unknown
  depositPercent: unknown
  currency: unknown
  lineItems?: Array<{ amount?: unknown; addition?: unknown }> | null
  /** The trip's real total when known; else it is worked back. */
  tripTotal?: number | null
}

export interface TripCostBreakdown {
  fullTripCost: number
  depositAmount: number
  balanceAmount: number
}

export function tripCostBreakdown(input: TripCostInput): TripCostBreakdown {
  const pct = Number(input.depositPercent) || 0
  const known = typeof input.tripTotal === 'number' && input.tripTotal > 0 ? input.tripTotal : null
  // A final invoice carries the extras billed with the balance. They are not
  // part of the trip's cost: worked back WITH them, a 1,000 trip with a 100
  // deposit and 200 of extras printed "Full Trip Cost 1,222.22, Deposit
  // 122.22". The extras stay on their own lines.
  const extras = (input.lineItems || [])
    .filter(l => l.addition)
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const tripPart = (Number(input.totalAmount) || 0) - (input.invoiceType === 'final' ? extras : 0)
  const worked = known ?? (pct <= 0 || pct >= 100
    ? tripPart
    : input.invoiceType === 'deposit'
      ? (tripPart * 100) / pct
      : tripPart + (tripPart * pct) / (100 - pct))

  // With the real total, this invoice's own amount is the deposit (or the
  // balance) — not a percentage of a total worked back from a guess.
  const deposit = known !== null && input.invoiceType === 'deposit'
    ? tripPart
    : known !== null
      ? known - tripPart
      : (worked * pct) / 100

  const fullTripCost = roundToCurrency(worked, input.currency)
  const depositAmount = roundToCurrency(deposit, input.currency)
  // The balance is the difference of the rounded figures, so the three add up.
  return { fullTripCost, depositAmount, balanceAmount: roundToCurrency(fullTripCost - depositAmount, input.currency) }
}
