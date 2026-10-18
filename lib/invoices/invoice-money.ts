// ============================================
// The money lines of a new invoice
// ============================================
// subtotal + tax − discount = total, on every invoice.
//
// A standard invoice is worked out from its own line items and tax rate. The
// form's tax_amount and total_amount are not trusted: picking a trip,
// switching the type or changing the deposit percentage reset the line and
// subtotal but kept the old tax, so a 1,000 trip went out as "Subtotal 930 /
// Tax 70 at 14% / Total 1,000".
//
// A deposit or final invoice is a server-computed share of the trip with no
// tax line of its own, so it carries none.

import { roundToCurrency } from '@/lib/currency-totals'

export interface InvoiceMoneyInput {
  invoiceType: string
  /** The total the server worked out (a deposit/final share, or the form's total). */
  total: number
  /** Every line on the invoice, extras included. */
  lineItems: Array<{ amount?: unknown }>
  taxRate?: unknown
  discountAmount?: unknown
  currency: string
}

export interface InvoiceMoney {
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
}

export function invoiceMoney(input: InvoiceMoneyInput): InvoiceMoney {
  const { invoiceType, lineItems, currency } = input
  const total = roundToCurrency(Number(input.total) || 0, currency)
  if (invoiceType !== 'standard') {
    return { subtotal: total, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: total }
  }
  const rate = Math.max(0, Number(input.taxRate) || 0)
  const discount = Math.max(0, Number(input.discountAmount) || 0)
  const linesSum = lineItems.reduce((sum, l) => sum + (Number(l?.amount) || 0), 0)
  // No priced lines (a caller that sends only a total): the total stands and
  // carries no tax line rather than an invented one.
  if (!(linesSum > 0)) {
    return { subtotal: total, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: total }
  }
  const subtotal = roundToCurrency(linesSum, currency)
  const tax = roundToCurrency((subtotal * rate) / 100, currency)
  return {
    subtotal,
    tax_rate: rate,
    tax_amount: tax,
    discount_amount: discount,
    total_amount: roundToCurrency(subtotal + tax - discount, currency),
  }
}
