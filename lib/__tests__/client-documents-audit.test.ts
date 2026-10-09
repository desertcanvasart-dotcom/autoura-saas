// What clients and suppliers receive (audit of 2026-10-09):
//   - the itinerary PDF emailed to the client printed each line's SUPPLIER
//     cost under the client's total, exposing the margin;
//   - payment reminders chased drafts, and a final invoice with no due date
//     was "~20,700 days overdue, due 1 January 1970";
//   - the client email was one company's ("Your Egypt Adventure Awaits!",
//     "A 30% deposit…", "© Travel2Egypt.org"), with the client's name as HTML;
//   - status messages wrote 'pending_payment' / 'paid' into the trip's status;
//   - the supplier voucher PDF printed no date on its lines.
import { describe, it, expect } from 'vitest'
import jsPDF from 'jspdf'
import { serviceClientPrice, itineraryClientTotal } from '@/lib/itinerary-client-total'
import { generateItineraryPDF } from '@/lib/pdf-generator'
import { reminderBlocker } from '@/lib/invoice-dates'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { statusAfterMessage } from '@/lib/whatsapp-status-after-message'
import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'

const pdfText = (pdf: jsPDF) => [...pdf.output().matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')

describe('the itinerary PDF prices its lines at the client price', () => {
  it('a line is its client_price, else cost × (1 + margin); the lines add up to the total', () => {
    expect(serviceClientPrice({ total_cost: 100 }, 25)).toBe(125)
    expect(serviceClientPrice({ total_cost: 100, client_price: 140 }, 25)).toBe(140)
    expect(itineraryClientTotal([{ total_cost: 2000 }, { total_cost: 400 }], 25)).toBe(3000)
  })

  it('the PDF shows 2500 and 500 for lines that cost 2000 and 400 — never the cost', () => {
    const itinerary = { id: 'i', itinerary_code: 'ITN-1', client_name: 'Tersa', trip_name: 'Cairo', start_date: '2026-10-01', end_date: '2026-10-02', num_adults: 2, num_children: 0, currency: 'EUR', total_cost: 0, margin_percent: 25 }
    const days = [{ day_number: 1, date: '2026-10-01', title: 'Day 1', description: '', services: [
      { service_type: 'accommodation', service_name: 'Mena House', quantity: 2, total_cost: 2000 },
      { service_type: 'transportation', service_name: 'Sedan', quantity: 1, total_cost: 400 },
    ] }]
    const text = pdfText(generateItineraryPDF(itinerary as never, days as never, { showPricingBreakdown: true }) as unknown as jsPDF)
    expect(text).toContain('1250.00')
    expect(text).toContain('2500.00')
    expect(text).toContain('3000.00')
    expect(text).not.toContain('2000.00')
    expect(text).not.toContain('400.00')
  })
})

describe('which invoices may be chased', () => {
  it('a sent, partly paid or overdue invoice with a due date', () => {
    for (const status of ['sent', 'partial', 'overdue']) expect(reminderBlocker({ status, due_date: '2026-11-01' })).toBeNull()
  })
  it('never a draft, a paid or cancelled one, or one with no due date', () => {
    expect(reminderBlocker({ status: 'draft', due_date: '2026-11-01' })).toMatch(/draft/)
    expect(reminderBlocker({ status: 'paid', due_date: '2026-11-01' })).not.toBeNull()
    expect(reminderBlocker({ status: 'sent', due_date: null })).toMatch(/no due date/)
  })
})

describe('the client itinerary email', () => {
  const html = generateEmailTemplate('Smith & <Co>', 'ITN-1', 'Atlas <b>Tour</b>', '¥450,000', { company: 'Morocco Trails', email: 'hi@mt.ma' }, 20)

  it('names the operator, not one company or country', () => {
    expect(html).toContain('Morocco Trails')
    expect(html).not.toMatch(/Egypt|Travel2Egypt/)
  })
  it('asks for the operator’s deposit, or none', () => {
    expect(html).toContain('A 20% deposit confirms your booking.')
    expect(generateEmailTemplate('A', 'B', 'C', '$1', {}, null)).not.toMatch(/deposit/)
  })
  it('escapes the client’s and the trip’s text', () => {
    expect(html).toContain('Smith &amp; &lt;Co&gt;')
    expect(html).not.toContain('<b>Tour</b>')
  })
})

describe('a WhatsApp status message and the trip’s status', () => {
  it('a payment reminder or a payment thank-you leaves the trip as it is', () => {
    expect(statusAfterMessage('confirmed', 'pending_payment')).toBeNull()
    expect(statusAfterMessage('confirmed', 'paid')).toBeNull()
  })
  it('confirms a draft or sent trip; completes or cancels; never reopens a finished one', () => {
    expect(statusAfterMessage('draft', 'confirmed')).toBe('confirmed')
    expect(statusAfterMessage('confirmed', 'confirmed')).toBeNull()
    expect(statusAfterMessage('confirmed', 'completed')).toBe('completed')
    expect(statusAfterMessage('completed', 'cancelled')).toBeNull()
  })
})

describe('the supplier voucher PDF dates its lines', () => {
  it('a guide booked on three days prints each day', () => {
    const text = pdfText(generateSupplierDocumentPDF({
      id: '1', document_type: 'guide_assignment', document_number: 'GA-1', supplier_name: 'Mona Hassan', client_name: 'Tersa',
      num_adults: 2, num_children: 0, currency: 'EUR', total_cost: '300.00', created_at: '2026-10-02',
      services: [
        { service_name: 'English Cairo', date: '2026-10-02', quantity: 1, total_cost: '100.00' },
        { service_name: 'English Luxor', date: '2026-10-04', quantity: 1, total_cost: 100 },
        { service_name: 'English Aswan', date: '2026-10-06', quantity: 1, total_cost: 100 },
      ],
    } as never))
    expect(text).toContain('Oct 2')
    expect(text).toContain('Oct 4')
    expect(text).toContain('Oct 6')
    expect(text).toContain('TOTAL AMOUNT')
    expect(text).toMatch(/300\.00/)
  })
})

// ── Medium items of the same audit ────────────────────────────────────────
import { formatMoney } from '@/lib/currency-totals'
import { tripInclusions } from '@/lib/pdf-generator'
import { identityFromTenant } from '@/lib/company-identity'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'

describe('money as the client reads it', () => {
  it('yen without decimals, separators, a space after a code', () => {
    expect(formatMoney(450000, 'JPY')).toBe('JPY 450,000')
    expect(formatMoney('1250.5', 'USD')).toBe('$1,250.50')
    expect(formatMoney(3400, 'MAD')).toBe('MAD 3,400.00')
  })
})

describe('the itinerary PDF says what this trip includes, on this agency’s terms', () => {
  it('inclusions come from the trip’s services — no guide or vehicle a hotel-only trip lacks', () => {
    expect(tripInclusions([{ service_type: 'accommodation' }])).toEqual(['Accommodation as listed in the itinerary'])
    expect(tripInclusions([{ service_type: 'guide' }, { service_type: 'entrance_fee' }, { service_type: 'other', service_name: 'Water Bottles' }]))
      .toEqual(['Guiding for the tours listed', 'Entrance fees for the sites listed', 'Bottled water'])
  })
  it('payment terms are the agency’s deposit and country', () => {
    const t = identityFromTenant({ company_name: 'Atlas', deposit_percent: 20, operating_country: 'Morocco' }).paymentTerms
    expect(t).toContain('20% deposit')
    expect(t).toContain('Morocco')
    expect(identityFromTenant(null).paymentTerms).toBeUndefined()
  })
})

describe('a final invoice that bills extras with the balance', () => {
  it('works the trip cost back from the balance alone: 1,000 trip, 10% deposit, 200 of extras', () => {
    const text = pdfText(generateInvoicePDF({
      id: 'i', invoice_number: 'INV-2', invoice_type: 'final', deposit_percent: 10, client_name: 'A', client_email: 'a@x',
      line_items: [
        { description: 'Balance Payment - Tour', quantity: 1, unit_price: 900, amount: 900 },
        { description: 'Camel ride', quantity: 1, unit_price: 200, amount: 200, addition: true },
      ],
      subtotal: 1100, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 1100, currency: 'USD',
      amount_paid: 0, balance_due: 1100, status: 'sent', issue_date: '2026-10-01', due_date: '2026-10-20',
      notes: null, payment_terms: null, payment_instructions: null,
    } as never) as unknown as jsPDF)
    expect(text).toContain('$1,000.00')
    expect(text).toContain('$100.00')
    expect(text).not.toContain('1,222.22')
    expect(text).not.toMatch(/Cairo/)
  })
})

describe('the supplier voucher prints every special request', () => {
  it('a six-line request reaches the supplier whole', () => {
    const lines = ['Vegetarian meals', 'Wheelchair access', 'Ground floor room', 'Late check-out', 'Japanese-speaking guide', 'Airport wheelchair assist']
    const text = pdfText(generateSupplierDocumentPDF({
      id: '1', document_type: 'hotel_voucher', document_number: 'HV-1', supplier_name: 'Mena House', client_name: 'Tersa',
      num_adults: 2, num_children: 0, currency: 'EUR', total_cost: 100, created_at: '2026-10-02', services: [],
      special_requests: lines.join('\n'),
    } as never))
    for (const l of lines) expect(text).toContain(l)
  })
})
