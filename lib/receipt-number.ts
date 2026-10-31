// The receipt-number rule on its own — no jspdf here.
//
// Pages that only need the number (Receipts list, invoice page, receipt page)
// imported it from lib/receipt-pdf-generator.ts, and that static import put
// jspdf (~130 KB gzipped) into their FIRST load even though the PDF itself is
// built only on click (`await import('@/lib/receipt-pdf-generator')`).
// receipt-pdf-generator.ts re-exports it, so server code is unchanged.

/**
 * A payment's receipt number — ONE rule wherever a receipt is made (the
 * invoice page, the receipts page, the receipt page, WhatsApp): its
 * transaction reference, else RCP- and the payment id. The invoice page
 * numbered receipts by position in a newest-first list, so each new payment
 * renumbered the older receipts, and WhatsApp sent yet another number.
 */
export function receiptNumberFor(payment: { id: string; transaction_reference?: string | null }): string {
  return payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
}
