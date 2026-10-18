import { describe, it, expect } from 'vitest'
import type { jsPDF } from 'jspdf'
import { generateItineraryPDF } from '@/lib/pdf-generator'

// Every line jsPDF draws, with its page and y (mm), from the raw content stream.
function linesByPage(doc: jsPDF): Array<{ page: number; y: number }> {
  const out: Array<{ page: number; y: number }> = []
  const pageHeightPt = doc.internal.pageSize.getHeight() * (72 / 25.4)
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p)
    const stream = (doc.internal as unknown as { pages: string[][] }).pages[p].join('\n')
    for (const m of stream.matchAll(/([\d.]+) ([\d.]+) Td/g)) {
      const yPt = pageHeightPt - Number(m[2])
      out.push({ page: p, y: yPt / (72 / 25.4) })
    }
  }
  return out
}

describe('itinerary PDF pagination', () => {
  it('a long day description continues on the next page, never past the footer', () => {
    const description = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of a very long day programme with many stops.`).join('\n')
    const itinerary = { id: 'i', itinerary_code: 'ITN-1', client_name: 'Tersa', trip_name: 'Long', start_date: '2026-10-01', end_date: '2026-10-02', num_adults: 2, num_children: 0, currency: 'EUR', total_cost: 100, margin_percent: 25 }
    const days = [{ day_number: 1, date: '2026-10-01', title: 'Day 1', description, services: [] }]
    const doc = generateItineraryPDF(itinerary as never, days as never, { showPricingBreakdown: false }) as unknown as jsPDF
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    const pageHeight = doc.internal.pageSize.getHeight()
    // Every line is either the footer (pageHeight - 10) or above the footer band.
    expect(linesByPage(doc).every(l => Math.abs(l.y - (pageHeight - 10)) < 1.5 || l.y <= pageHeight - 20 + 0.5)).toBe(true)
  })

  it('the TOTAL PRICE box never lands on the footer or off the page, however long the table', () => {
    for (const n of [10, 11, 12, 13, 14, 15, 16, 17, 18]) {
      const services = Array.from({ length: n }, (_, i) => ({ service_type: 'activity', service_name: `Visit ${i + 1}`, quantity: 1, total_cost: 100 + i }))
      const itinerary = { id: 'i', itinerary_code: 'ITN-1', client_name: 'Tersa', trip_name: 'Many', start_date: '2026-10-01', end_date: '2026-10-02', num_adults: 2, num_children: 0, currency: 'EUR', total_cost: 0, margin_percent: 25 }
      const doc = generateItineraryPDF(itinerary as never, [{ day_number: 1, date: '2026-10-01', title: 'Day 1', description: '', services }] as never, { showPricingBreakdown: true }) as unknown as jsPDF
      const pageHeight = doc.internal.pageSize.getHeight()
      const lines = linesByPage(doc)
      expect(lines.every(l => Math.abs(l.y - (pageHeight - 10)) < 1.5 || l.y <= pageHeight - 20 + 0.5), `n=${n}`).toBe(true)
    }
  })
})
