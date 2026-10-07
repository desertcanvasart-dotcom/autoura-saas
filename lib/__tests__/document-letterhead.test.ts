import { describe, it, expect } from 'vitest'
import jsPDF from 'jspdf'
import { identityFromTenant, letterheadFooterLines } from '@/lib/company-identity'
import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'

const pdfText = (pdf: jsPDF) => {
  const raw = pdf.output()
  return [...raw.matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')
}

describe('letterhead fields from Settings → Organization', () => {
  it('reads the new tenant fields; blank ones are omitted', () => {
    const c = identityFromTenant({
      company_name: 'Afford Egypt', tagline: '  ', company_address: '1 Nile St\nCairo',
      license_number: '77', tax_number: null, document_footer_text: 'Bank: CIB',
    })
    expect(c.tagline).toBeUndefined()
    expect(c.footerText).toBe('Bank: CIB')
    expect(letterheadFooterLines(c)).toEqual(['1 Nile St, Cairo', 'License No. 77'])
  })

  it('an agency with nothing filled in gets no footer lines', () => {
    expect(letterheadFooterLines(identityFromTenant({ company_name: 'X' }))).toEqual([])
  })
})

describe('supplier document PDF', () => {
  const base = {
    id: '1', document_type: 'service_order', document_number: 'SO-1', supplier_name: 'Siwa Fees', client_name: 'Narcis',
    num_adults: 4, num_children: 0, currency: 'USD', total_cost: 19.61, created_at: '2026-10-02',
    services: [{ service_name: 'Temple of Aghurmi', quantity: 4 }],
  }

  it('prints the agency, never a hard-coded Travel2Egypt', () => {
    const text = pdfText(generateSupplierDocumentPDF({
      ...base,
      company: identityFromTenant({ company_name: 'Afford Egypt', tagline: 'Nile specialists', license_number: '77', document_footer_text: 'Bank: CIB' }),
    }))
    expect(text).toContain('Afford Egypt')
    expect(text).toContain('Nile specialists')
    expect(text).toContain('License No. 77')
    expect(text).toContain('Bank: CIB')
    expect(text).not.toMatch(/TRAVEL2EGYPT|Gateway to Egypt/i)
  })

  it('repeats the footer on every page and numbers them', () => {
    const services = Array.from({ length: 30 }, (_, i) => ({ service_name: `Line ${i}`, quantity: 1 }))
    const pdf = generateSupplierDocumentPDF({ ...base, services, company: identityFromTenant({ company_name: 'Afford Egypt' }) })
    expect(pdf.getNumberOfPages()).toBe(2)
    const text = pdfText(pdf)
    expect(text).toContain('Page 1 of 2')
    expect(text).toContain('Page 2 of 2')
  })
})

describe('invoices, receipts and contracts share the letterhead', () => {
  const company = identityFromTenant({
    company_name: 'Afford Egypt', tagline: 'Nile specialists', company_address: '1 Nile St',
    license_number: '77', tax_number: '555', document_footer_text: 'Bank: CIB',
  })
  const expectLetterhead = (text: string) => {
    for (const s of ['Afford Egypt', 'Nile specialists', '1 Nile St', 'License No. 77', 'Tax No. 555', 'Bank: CIB']) {
      expect(text).toContain(s)
    }
    expect(text).not.toMatch(/TRAVEL2EGYPT|Travel2Egypt/)
  }
  const invoice = {
    id: 'i', invoice_number: 'INV-1', client_name: 'Jamie', client_email: 'j@x.com',
    line_items: [{ description: 'Nile cruise', quantity: 2, unit_price: 100, amount: 200 }],
    subtotal: 200, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 200, currency: 'USD',
    amount_paid: 0, balance_due: 200, status: 'sent', issue_date: '2026-10-01', due_date: '2026-10-15',
    notes: null, payment_terms: null, payment_instructions: null,
  }

  it('invoice: letterhead and footer, and long invoices break onto a numbered second page', async () => {
    const { generateInvoicePDF } = await import('@/lib/invoice-pdf-generator')
    expectLetterhead(pdfText(generateInvoicePDF(invoice, company)))
    const long = generateInvoicePDF({
      ...invoice,
      line_items: Array.from({ length: 30 }, (_, i) => ({ description: `Line ${i}`, quantity: 1, unit_price: 1, amount: 1 })),
    }, company)
    expect(long.getNumberOfPages()).toBe(2)
    expect(pdfText(long)).toContain('Page 2 of 2')
  })

  it('receipt: letterhead and footer', async () => {
    const { generateReceiptPDF } = await import('@/lib/receipt-pdf-generator')
    const pdf = generateReceiptPDF({
      receiptNumber: 'RCT-1', invoiceNumber: 'INV-1', clientName: 'Jamie', clientEmail: '', paymentDate: '2026-10-02',
      paymentMethod: 'bank_transfer', amount: 200, currency: 'USD', transactionRef: null, notes: null,
    }, { invoice_number: 'INV-1', client_name: 'Jamie', total_amount: 200, currency: 'USD' }, company)
    expectLetterhead(pdfText(pdf))
  })

  it('contract: letterhead and footer, the agency as Service Provider', async () => {
    const { generateContractPDF } = await import('@/lib/contract-pdf-generator')
    const bytes = await generateContractPDF({
      company, contractNumber: 'C-1', contractDate: '2026-10-02', clientName: 'Jamie', numTravelers: 2,
      tourName: 'Nile', startDate: '2026-11-01', endDate: '2026-11-08', destinations: 'Cairo, Luxor', totalCost: 2000, currency: 'USD',
    })
    const raw = Buffer.from(bytes).toString('latin1')
    const text = [...raw.matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')
    expect(raw.startsWith('%PDF-')).toBe(true)
    expectLetterhead(text)
    expect(text).toContain('Service Provider')
  })
})
