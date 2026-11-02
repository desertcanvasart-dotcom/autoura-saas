import { invoiceMoney } from '@/lib/invoices/invoice-money'
import { invoiceBalance } from '@/lib/invoices/invoice-balance'
import { roundToCurrency } from '@/lib/currency-totals'

// ============================================
// WRITE OFF AN INVOICE'S UNPAID BALANCE
// ============================================
// A trip is cancelled after the client paid part of its invoice. The invoice
// can't be voided (its payments would be orphaned), so the agency keeps what
// was paid as the cancellation charge and the rest is written off: nothing is
// due any more and the invoice reads Paid.
//
// The invoice must still add up. A standard invoice with priced lines takes
// the balance as extra discount (subtotal + tax − discount = what was paid);
// a deposit / final invoice, or one with no lines, has its total brought down
// to what was paid. A note says what happened. An unpaid invoice is voided,
// not written off; a settled one has nothing to write off.

export interface WriteOffInput {
  invoice_type: string | null
  line_items: Array<{ amount?: unknown }> | null
  tax_rate: unknown
  discount_amount: unknown
  total_amount: unknown
  amount_paid: unknown
  currency: string | null
  status: string | null
  paid_at: string | null
  notes: string | null
}

export type WriteOffResult =
  | { ok: true; written_off: number; update: Record<string, unknown> }
  | { ok: false; error: string }

export function writeOffBalance(inv: WriteOffInput, reason: string | null, now: () => string = () => new Date().toISOString()): WriteOffResult {
  const currency = String(inv.currency || 'EUR')
  if (inv.status === 'cancelled') return { ok: false, error: 'This invoice is cancelled' }
  const paid = roundToCurrency(Number(inv.amount_paid) || 0, currency)
  if (!(paid > 0)) return { ok: false, error: 'Nothing was paid on this invoice — cancel it instead' }
  const total = roundToCurrency(Number(inv.total_amount) || 0, currency)
  const due = roundToCurrency(total - paid, currency)
  if (!(due > 0)) return { ok: false, error: 'Nothing is due on this invoice' }

  const type = String(inv.invoice_type || 'standard')
  const lines = inv.line_items ?? []
  const hasLines = lines.reduce((s, l) => s + (Number(l?.amount) || 0), 0) > 0
  const money = type === 'standard' && hasLines
    ? invoiceMoney({ invoiceType: type, total, lineItems: lines, taxRate: inv.tax_rate, discountAmount: roundToCurrency((Number(inv.discount_amount) || 0) + due, currency), currency })
    : invoiceMoney({ invoiceType: type, total: paid, lineItems: [], taxRate: 0, discountAmount: 0, currency })
  const balance = invoiceBalance({ total: money.total_amount, paid, currency, status: inv.status, paidAt: inv.paid_at }, now)

  const line = `Balance of ${currency} ${due.toFixed(2)} written off — trip cancelled${reason ? `: ${reason}` : ''}.`
  return {
    ok: true,
    written_off: due,
    update: {
      ...money,
      balance_due: balance.balance_due,
      status: balance.status,
      paid_at: balance.paid_at,
      notes: inv.notes ? `${inv.notes}\n${line}` : line,
      updated_at: now(),
    },
  }
}
