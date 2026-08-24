import { describe, it, expect } from 'vitest'
import jsPDFDefault from 'jspdf'
import autoTable from 'jspdf-autotable'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { generateReceiptPDF } from '@/lib/receipt-pdf-generator'
import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'

// ============================================================================
// A jsPDF major bump can type-check cleanly and still fail at RUNTIME —
// renamed internals, a stricter argument check, a changed font default. Only
// calling the generators proves they still work.
//
// Written during the jsPDF 3 → 4 upgrade, which closed a critical advisory.
// `tsc` was clean on the first try; what these caught instead was that v4
// THROWS on an undefined text argument where v3 silently rendered the string
// "undefined" — stricter, and better, but the kind of change that only shows
// up when the code actually runs.
//
// Deliberately shallow: it asserts a real PDF came out, not what it looks
// like. Pixel assertions on a document nobody diffs would be noise.
// ============================================================================

// 1x1 red PNG — a real, embeddable image. `addImage` is the only non-text
// jsPDF API this codebase uses and the likeliest to move in a major version,
// so the branded path exercises it for real rather than mocking it away.
const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function expectRealPdf(doc: { output: (t: string) => ArrayBuffer; getNumberOfPages: () => number }) {
  const buf = Buffer.from(doc.output('arraybuffer'))
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  // A generator that silently produced an empty document would still emit a
  // valid header, so require it to have actual content.
  expect(buf.length).toBeGreaterThan(800)
  expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  return buf
}

const INVOICE = {
  invoice_number: 'INV-TEST',
  client_name: 'Test Client',
  client_email: 'client@example.test',
  issue_date: '2026-08-25',
  due_date: '2026-09-25',
  currency: 'EUR',
  subtotal: 1000,
  tax_amount: 140,
  tax_rate: 14,
  discount_amount: 0,
  total_amount: 1140,
  amount_paid: 140,
  balance_due: 1000,
  status: 'sent',
  invoice_type: 'deposit',
  deposit_percent: 10,
  line_items: [{ description: 'Cairo day tour', quantity: 2, unit_price: 500, amount: 1000 }],
  payment_terms: '10% deposit to confirm',
  notes: 'Thank you',
} as any

describe('PDF generators still render on the installed jsPDF', () => {
  it('invoice — unbranded tenant (the default path)', () => {
    expectRealPdf(generateInvoicePDF(INVOICE, { name: 'Acme Tours' }))
  })

  it('invoice — branded tenant, exercising addImage with a real logo', () => {
    const branded = expectRealPdf(
      generateInvoicePDF(INVOICE, {
        name: 'Acme Tours',
        primaryColor: '#112233',
        logoDataUrl: RED_PNG,
        email: 'hi@acme.test',
        website: 'acme.test',
        phone: '+20 100 000 0000',
      }),
    )
    const plain = Buffer.from(
      (generateInvoicePDF(INVOICE, { name: 'Acme Tours' }) as any).output('arraybuffer'),
    )
    // The logo has to actually reach the document, not be swallowed by the
    // best-effort try/catch around addImage.
    expect(branded.length).toBeGreaterThan(plain.length)
  })

  it('receipt', () => {
    expectRealPdf(
      generateReceiptPDF(
        {
          receiptNumber: 'RCP-TEST',
          invoiceNumber: 'INV-TEST',
          clientName: 'Test Client',
          clientEmail: 'client@example.test',
          paymentDate: '2026-08-25',
          paymentMethod: 'card',
          amount: 140,
          currency: 'EUR',
          transactionRef: 'tx_test',
          notes: 'Deposit received',
        } as any,
        {
          invoice_number: 'INV-TEST',
          client_name: 'Test Client',
          total_amount: 1140,
          currency: 'EUR',
        },
        { name: 'Acme Tours', primaryColor: '#112233', logoDataUrl: RED_PNG },
      ),
    )
  })

  it('supplier document', () => {
    expectRealPdf(
      generateSupplierDocumentPDF({
        id: 'sd-test',
        document_type: 'voucher',
        document_number: 'SD-TEST',
        supplier_name: 'Nile Hotels',
        client_name: 'Test Client',
        num_adults: 2,
        num_children: 1,
        city: 'Cairo',
        service_date: '2026-09-01',
        currency: 'EUR',
        total_cost: 1140,
        company: { name: 'Acme Tours', primaryColor: '#112233', logoDataUrl: RED_PNG },
      } as any),
    )
  })

  // jspdf-autotable is a SEPARATE package pinned against jsPDF's major. It is
  // the piece most likely to break on a jsPDF bump while everything else
  // compiles, so the pairing gets its own check. lib/finance-export calls it
  // exactly this way, but ends in doc.save() — browser-only — so the interop
  // is pinned here rather than through that function.
  it('jspdf-autotable still drives the installed jsPDF', () => {
    const doc = new jsPDFDefault({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Description', 'Amount']],
      body: [
        ['2026-08-25', 'Cairo day tour', '1000.00'],
        ['2026-08-26', 'Luxor transfer', '140.00'],
      ],
    })
    expectRealPdf(doc as any)
  })
})
