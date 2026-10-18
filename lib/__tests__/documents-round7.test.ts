import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { receiptNumberFor } from '@/lib/receipt-pdf-generator'
import { formatPhoneForWhatsApp, dialCodeForCountry } from '@/lib/communication-utils'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('receipt numbers', () => {
  it('one rule: the transaction reference, else RCP- and the payment id', () => {
    expect(receiptNumberFor({ id: 'abcdef12-3456', transaction_reference: 'TX-9' })).toBe('TX-9')
    expect(receiptNumberFor({ id: 'abcdef12-3456', transaction_reference: null })).toBe('RCP-ABCDEF12')
  })
  it('the invoice page no longer numbers by list position', () => {
    expect(src('app/invoices/[id]/page.tsx')).not.toContain('payments.indexOf(payment) + 1')
  })
})

describe('formatPhoneForWhatsApp', () => {
  it('never makes a US/Canadian number Egyptian', () => {
    expect(formatPhoneForWhatsApp('1 (415) 555-1234')).toBe('14155551234')
    expect(formatPhoneForWhatsApp('1 (415) 555-1234', 'Egypt')).toBe('14155551234')
  })
  it("gives a local number the agency's own dialling code", () => {
    expect(formatPhoneForWhatsApp('0100 123 4567', 'Egypt')).toBe('201001234567')
    expect(formatPhoneForWhatsApp('090-1234-5678', 'Japan')).toBe('819012345678')
    expect(formatPhoneForWhatsApp('0612345678', 'Morocco')).toBe('212612345678')
  })
  it('keeps international numbers and an unknown country alone', () => {
    expect(formatPhoneForWhatsApp('+44 20 7946 0958', 'Egypt')).toBe('442079460958')
    expect(formatPhoneForWhatsApp('0044 20 7946 0958')).toBe('442079460958')
    expect(formatPhoneForWhatsApp('0100 123 4567')).toBe('01001234567')
    expect(dialCodeForCountry('Atlantis')).toBeNull()
  })
})

describe('WhatsApp invoice', () => {
  const route = src('app/api/whatsapp/send-invoice/route.ts')
  it('the PDF the customer receives is not stamped DRAFT', () => {
    expect(route).toContain("status: invoice.status === 'draft' ? 'sent' : invoice.status")
  })
  it('no "On Arrival" due date', () => {
    expect(route).not.toContain("'On Arrival'")
    expect(src('lib/invoice-pdf-generator.ts')).not.toContain("'On Arrival'")
    expect(src('app/invoices/[id]/page.tsx')).not.toContain("'On Arrival'")
  })
})

describe('the font check sees the letterhead', () => {
  it('passes the company identity, not only its name', () => {
    for (const f of ['app/invoices/[id]/page.tsx', 'app/receipts/page.tsx', 'app/documents/receipt/[id]/page.tsx', 'app/documents/invoice/[id]/page.tsx', 'app/documents/contract/[id]/page.tsx', 'app/itineraries/[id]/page.tsx']) {
      expect(src(f), f).not.toMatch(/browserPdfFontFor\([^)]*tenant\?\.company_name\)/)
    }
  })
})

describe('template data quotes the client total', () => {
  it('both routes compute it from the services', () => {
    expect(src('app/api/clients/[id]/template-data/route.ts')).toContain('effectiveItineraryTotal(')
    expect(src('app/api/itineraries/[id]/template-data/route.ts')).toContain('effectiveItineraryTotal(')
  })
})
