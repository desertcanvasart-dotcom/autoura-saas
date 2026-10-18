// ============================================
// The invoice for one payment (/documents/invoice/[id])
// ============================================
// The page hard-coded deposit_percent: 30 for every deposit, so the PDF worked
// the trip total back from it: a 500 deposit on a 3,000 trip printed a
// 1,666.67 trip and a 1,166.67 balance. It also looked for payment_type
// 'final', which payments never have ('balance' is), so balance payments
// printed as plain invoices. The trip's real total is on the payment
// (GET /api/payments/[id] returns the itinerary's total_cost).

export type PaymentInvoiceType = 'standard' | 'deposit' | 'final'

export interface PaymentInvoiceShape {
  invoiceType: PaymentInvoiceType
  /** The share of the trip this deposit is, or the deposit already paid
   *  before this balance; undefined for a standard invoice. */
  depositPercent?: number
  tripTotal?: number
}

/** How a payment's invoice is drawn, from what the payment and its trip hold. */
export function paymentInvoiceShape(paymentType: string | null | undefined, amount: number, tripTotal: number | string | null | undefined): PaymentInvoiceShape {
  const type: PaymentInvoiceType =
    paymentType === 'deposit' ? 'deposit' : paymentType === 'balance' ? 'final' : 'standard'
  // numeric columns can arrive as strings; anything unreadable is "no total".
  const parsed = tripTotal === null || tripTotal === undefined ? NaN : Number(tripTotal)
  const total = Number.isFinite(parsed) ? parsed : null
  const amt = Number(amount)
  // No trip total, or an amount that is not a part of it: no breakdown —
  // never one made up.
  if (type === 'standard' || total === null || total <= 0 || !(amt > 0) || amt > total) {
    return { invoiceType: 'standard' }
  }
  const depositShare = type === 'deposit' ? amt / total : (total - amt) / total
  const depositPercent = Math.round(depositShare * 1000) / 10
  if (!(depositPercent > 0 && depositPercent < 100)) return { invoiceType: 'standard' }
  return { invoiceType: type, depositPercent, tripTotal: total }
}
