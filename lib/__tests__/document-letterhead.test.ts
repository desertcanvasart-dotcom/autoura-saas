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
