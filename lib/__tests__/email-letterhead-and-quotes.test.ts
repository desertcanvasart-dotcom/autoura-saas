import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { emailIdentity, emailHeaderRow, emailFooterRow, emailSignOff } from '@/lib/email/letterhead-html'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'

const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const tenant = {
  company_name: 'Afford <Egypt>', tagline: 'Nile specialists', company_address: '1 Nile St', license_number: '77',
  tax_number: '555', document_footer_text: 'Bank: CIB', logo_url: 'https://cdn.example.com/logo.png', primary_color: '#123456',
}

describe('reminder email letterhead', () => {
  it("carries the agency's name, logo, colour and footer, escaped", () => {
    const c = emailIdentity(tenant)
    const html = emailHeaderRow(c) + emailFooterRow(c, 'This is an automated payment reminder.') + emailSignOff(c)
    expect(html).toContain('Afford &lt;Egypt&gt;')
    expect(html).not.toContain('Afford <Egypt>')
    expect(html).toContain('#123456')
    expect(html).toContain('src="https://cdn.example.com/logo.png"')
    for (const s of ['Nile specialists', '1 Nile St', 'License No. 77', 'Tax No. 555', 'Bank: CIB']) expect(html).toContain(s)
    expect(html).not.toMatch(/Travel2Egypt/i)
  })

  it('a non-http logo URL is never put into the email; no name signs off plainly', () => {
    const c = emailIdentity({ company_name: '', logo_url: 'javascript:alert(1)' })
    expect(emailHeaderRow(c)).not.toContain('<img')
    expect(emailSignOff(c)).toBe('Best regards,')
  })
})

describe('quote PDFs on the agency letterhead', () => {
  const company = { ...emailIdentity(tenant), logoDataUrl: RED_PNG }

  it('B2C quote renders with a company and logo', async () => {
    const buf = await renderToBuffer(React.createElement(B2CQuotePDF, {
      company,
      quote: {
        quote_number: 'Q-1', num_travelers: 2, tier: 'standard', total_cost: 1000, selling_price: 1300, price_per_person: 650,
        margin_percent: 30, currency: 'USD', cost_breakdown: { hotels: 600, guides: 400 }, valid_until: null,
        created_at: '2026-10-01', client_notes: null, clients: null, itineraries: null,
      },
    } as React.ComponentProps<typeof B2CQuotePDF>) as never)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('B2B rate sheet renders with a company', async () => {
    const buf = await renderToBuffer(React.createElement(B2BQuotePDF, {
      company,
      quote: {
        quote_number: 'B-1', tier: 'standard', tour_leader_included: false, currency: 'USD',
        ppd_accommodation: 80, ppd_cruise: 0, single_supplement: 30, fixed_transport: 200, fixed_guide: 150, fixed_other: 0,
        pp_entrance_fees: 40, pp_meals: 25, pp_tips: 10, pp_domestic_flights: 0,
        pricing_table: { 2: { pp: 900, total: 1800 }, 4: { pp: 800, total: 3200 } }, tour_leader_cost: 0,
        valid_from: null, valid_until: null, season: null, created_at: '2026-10-01', terms_and_conditions: null,
        b2b_partners: null, itineraries: null,
      },
    } as unknown as React.ComponentProps<typeof B2BQuotePDF>) as never)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
