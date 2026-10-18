// ============================================
// An invoice's paid / due / status, from its payments
// ============================================
// Pure: the payment-delete and invoice-edit routes and the tests share it
// (documents audit, round 12).
//
// - Summed in the currency's own decimals: 28.40 + 35.80 + 35.80 in floats
//   left "0.00 due" on a part-paid invoice — and a reminder for it.
// - Only the payment-derived statuses move. Deleting a payment put a draft or
//   cancelled invoice to 'sent' (and an overdue one too), so a draft was
//   chased; and editing a total never moved paid / part-paid at all.

import { roundToCurrency } from '@/lib/currency-totals'

/** Statuses a payment change never moves. */
const KEPT = ['draft', 'cancelled']
/** Statuses that only payments set — undone when the payments no longer add up. */
const FROM_PAYMENTS = ['paid', 'partially_paid']

export interface InvoiceBalanceInput {
  total: unknown
  paid: unknown
  currency: unknown
  status: string | null | undefined
  paidAt?: string | null
}

export interface InvoiceBalance {
  amount_paid: number
  balance_due: number
  status: string
  paid_at: string | null
}

export function invoiceBalance(input: InvoiceBalanceInput, now: () => string = () => new Date().toISOString()): InvoiceBalance {
  const total = roundToCurrency(Number(input.total) || 0, input.currency)
  const paid = roundToCurrency(Number(input.paid) || 0, input.currency)
  const current = String(input.status || 'draft')
  let status = current
  if (!KEPT.includes(current)) {
    if (paid > 0 && paid >= total) status = 'paid'
    else if (paid > 0) status = 'partially_paid'
    else if (FROM_PAYMENTS.includes(current)) status = 'sent'
  }
  return {
    amount_paid: paid,
    balance_due: roundToCurrency(total - paid, input.currency),
    status,
    paid_at: status === 'paid' ? (input.paidAt || now()) : null,
  }
}

/** Sums payment amounts in the invoice's currency decimals. */
export function sumPayments(payments: Array<{ amount: unknown }> | null | undefined, currency: unknown): number {
  return roundToCurrency((payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0), currency)
}
