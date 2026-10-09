// The invoice for a payment hard-coded a 30% deposit and worked the trip
// total back from it: a 500 deposit on a 3,000 trip printed a 1,666.67 trip
// and a 1,166.67 balance. It also looked for payment_type 'final', which
// payments never have, so balance payments printed as plain invoices.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import jsPDF from 'jspdf'
import { paymentInvoiceShape } from '@/lib/payment-invoice'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'

describe('paymentInvoiceShape', () => {
  it('a deposit is its real share of the trip', () => {
    expect(paymentInvoiceShape('deposit', 500, 3000)).toEqual({ invoiceType: 'deposit', depositPercent: 16.7, tripTotal: 3000 })
  })

  it('a balance payment is the balance invoice, after the deposit already paid', () => {
    expect(paymentInvoiceShape('balance', 2100, 3000)).toEqual({ invoiceType: 'final', depositPercent: 30, tripTotal: 3000 })
  })

  it('no trip total, or an amount that is not part of it: a plain invoice, no invented breakdown', () => {
    expect(paymentInvoiceShape('deposit', 500, null)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('deposit', 500, 0)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('deposit', 5000, 3000)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('deposit', 3000, 3000)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('full_payment', 3000, 3000)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('installment', 500, 3000)).toEqual({ invoiceType: 'standard' })
  })
})

describe('the invoice PDF breakdown', () => {
  const text = (doc: jsPDF) => [...doc.output().matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')
  const invoice = (over: Record<string, unknown>) => ({
    id: 'p1', invoice_number: 'INV-1', client_name: 'Jamie', client_email: '', line_items: [],
    subtotal: 500, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 500, currency: 'USD',
    amount_paid: 500, balance_due: 0, status: 'paid', issue_date: '2026-10-01', due_date: '2026-10-01',
    notes: null, payment_terms: null, payment_instructions: null, ...over,
  })

  it('prints the trip’s real total, deposit and balance', () => {
    const shape = paymentInvoiceShape('deposit', 500, 3000)
    const t = text(generateInvoicePDF(invoice({ invoice_type: shape.invoiceType, deposit_percent: shape.depositPercent, trip_total: shape.tripTotal }) as never))
    expect(t).toContain('3000.00')
    expect(t).toContain('2500.00')
    expect(t).not.toContain('1666.67')
    expect(t).not.toContain('1166.67')
  })
})

describe('the payment invoice page', () => {
  const page = readFileSync(join(process.cwd(), 'app/documents/invoice/[id]/page.tsx'), 'utf8')

  it('assumes no deposit percentage and no "upon arrival" terms', () => {
    expect(page).not.toMatch(/deposit_percent: payment\.payment_type === 'deposit' \? 30/)
    expect(page).not.toContain('30% deposit required')
    expect(page).toContain('paymentInvoiceShape(payment.payment_type, payment.amount, payment.total_cost)')
    expect(page).toContain('paymentTermsText(contractDepositPercent(settings), settings)')
  })

  it('goes back to where it was opened from, else its payment', () => {
    expect(page).toContain('<BackLink fallbackHref={`/payments/${payment.id}`} fallbackLabel="Payment" />')
    const detail = readFileSync(join(process.cwd(), 'app/payments/[id]/page.tsx'), 'utf8')
    expect(detail).toContain('withReturnTo(`/documents/invoice/${payment.id}`, `/payments/${payment.id}`)')
    expect(detail).toContain('withReturnTo(`/documents/receipt/${payment.id}`, `/payments/${payment.id}`)')
  })
})

describe('the receipt page', () => {
  const page = readFileSync(join(process.cwd(), 'app/documents/receipt/[id]/page.tsx'), 'utf8')

  it('has a real back link, not router.back()', () => {
    expect(page).not.toContain('router.back()')
    expect(page).toContain('<BackLink fallbackHref="/receipts" fallbackLabel="Receipts" />')
  })

  it('never links /itineraries/null', () => {
    expect(page).toMatch(/\{payment\.itinerary_id \? \(\s*<Link\s+href=\{`\/itineraries\/\$\{payment\.itinerary_id\}`\}/)
  })
})
