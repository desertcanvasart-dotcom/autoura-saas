// A transport voucher's vehicle and driver: the PDF always had the block, but
// supplier_documents had no columns, so it never printed (migration 402).
// Generate now copies them from the trip's transport lines.
import { describe, it, expect } from 'vitest'
import jsPDF from 'jspdf'
import { transportCrew } from '@/lib/documents/transport-crew'
import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'

const pdfText = (pdf: jsPDF) => [...pdf.output().matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')

describe('transportCrew', () => {
  it('takes the first vehicle the lines name, and every distinct driver', () => {
    expect(transportCrew([
      { vehicle_type: null, driver_name: 'Ahmed' },
      { vehicle_type: 'minivan', driver_name: 'Ahmed' },
      { vehicle_type: 'bus', driver_name: ' Karim ' },
    ])).toEqual({ vehicle_type: 'minivan', driver_name: 'Ahmed, Karim' })
  })

  it('invents nothing when the lines name nothing', () => {
    expect(transportCrew([{}, { vehicle_type: '  ', driver_name: '' }])).toEqual({ vehicle_type: null, driver_name: null })
  })
})

describe('transport voucher PDF', () => {
  const base = {
    id: '1', document_type: 'transport_voucher', document_number: 'TV-1', supplier_name: 'Cairo Transport', client_name: 'Narcis',
    num_adults: 2, num_children: 0, currency: 'EUR', total_cost: 90, created_at: '2026-10-02', services: [],
  }

  it('prints the vehicle, driver, pickup and drop-off', () => {
    const text = pdfText(generateSupplierDocumentPDF({
      ...base,
      vehicle_type: 'minivan', driver_name: 'Ahmed Saleh',
      pickup_location: 'Cairo Airport T2', dropoff_location: 'Mena House',
    } as never))
    expect(text).toContain('Minivan') // its "(4-6 pax)" is escaped inside the PDF string
    expect(text).toContain('Ahmed Saleh')
    expect(text).toContain('Cairo Airport T2')
    expect(text).toContain('Mena House')
  })

  it('says the driver is to be assigned when only the vehicle is known', () => {
    expect(pdfText(generateSupplierDocumentPDF({ ...base, vehicle_type: 'van' } as never))).toContain('To be assigned')
  })
})
