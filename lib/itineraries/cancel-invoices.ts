// What a trip's invoices need when the trip is cancelled.
//
// A cancelled trip kept its invoices open: an unpaid one went on showing
// Overdue, with reminders and a "Record payment" for money that would never
// come. Now:
//   unpaid (nothing paid, something due)  → 'void'     — the invoice is cancelled
//   part paid (paid, something still due) → 'writeoff' — the operator chooses:
//       keep what was paid and write off the rest, or leave it open
//   settled, or already cancelled         → left alone
// Used by the cancel dialog and, for trips already cancelled, the Finance tab.

export interface CancelInvoice {
  id: string
  invoice_number: string
  currency: string
  paid: number
  due: number
  action: 'void' | 'writeoff'
}

interface InvoiceRow {
  id?: unknown
  invoice_number?: unknown
  currency?: unknown
  status?: unknown
  amount_paid?: unknown
  balance_due?: unknown
}

export function cancelActionFor(inv: InvoiceRow): CancelInvoice | null {
  if (inv.status === 'cancelled') return null
  const due = Number(inv.balance_due) || 0
  if (!(due > 0.005)) return null
  const paid = Number(inv.amount_paid) || 0
  return {
    id: String(inv.id),
    invoice_number: String(inv.invoice_number ?? ''),
    currency: String(inv.currency || 'EUR'),
    paid,
    due,
    action: paid > 0.005 ? 'writeoff' : 'void',
  }
}

export function openInvoicesOnCancel(list: InvoiceRow[]): CancelInvoice[] {
  return list.map(cancelActionFor).filter((x): x is CancelInvoice => x !== null)
}
