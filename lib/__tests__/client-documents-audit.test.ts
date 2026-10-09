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
    expect(text).toContain('EUR 300.00')
  })
})
