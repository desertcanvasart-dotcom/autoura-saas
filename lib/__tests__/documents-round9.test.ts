import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoiceMoney } from '@/lib/invoices/invoice-money'

let country: string | null = null
let reads = 0
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: { operating_country: country } } } }) }) }),
  }),
}))

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('invoiceMoney', () => {
  it('works a standard invoice out from its lines and tax rate, not a stale tax amount', () => {
    // The form kept tax 70 from a 500 line after a 1,000 trip was picked.
    expect(invoiceMoney({ invoiceType: 'standard', total: 1000, lineItems: [{ amount: 1000 }], taxRate: 14, discountAmount: 0, currency: 'EUR' }))
      .toEqual({ subtotal: 1000, tax_rate: 14, tax_amount: 140, discount_amount: 0, total_amount: 1140 })
  })
  it('subtotal + tax − discount = total, with extras lines and in the currency unit', () => {
    const m = invoiceMoney({ invoiceType: 'standard', total: 0, lineItems: [{ amount: 100000 }, { amount: 2501 }], taxRate: 10, discountAmount: 500, currency: 'JPY' })
    expect(m).toEqual({ subtotal: 102501, tax_rate: 10, tax_amount: 10250, discount_amount: 500, total_amount: 112251 })
    expect(m.subtotal + m.tax_amount - m.discount_amount).toBe(m.total_amount)
  })
  it('a deposit or final share carries no tax line', () => {
    expect(invoiceMoney({ invoiceType: 'deposit', total: 370873, lineItems: [{ amount: 370873 }], taxRate: 14, discountAmount: 50, currency: 'JPY' }))
      .toEqual({ subtotal: 370873, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 370873 })
  })
  it('a caller with only a total keeps it', () => {
    expect(invoiceMoney({ invoiceType: 'standard', total: 250, lineItems: [], currency: 'EUR' }).total_amount).toBe(250)
  })
  it('the invoice form uses the same rule when the trip, type or deposit changes', () => {
    const form = src('app/invoices/invoices-content.tsx')
    expect(form.match(/\.\.\.amountsFor\(/g)?.length).toBe(3)
    expect(form).not.toMatch(/subtotal: calculatedAmount,\s*total_amount: calculatedAmount/)
  })
})

describe('tenant country for local numbers', () => {
  beforeEach(() => { reads = 0 })
  it('a missing country is not cached, so setting it in Settings takes effect', async () => {
    const { internationalNumber } = await import('@/lib/whatsapp')
    country = null
    expect(await internationalNumber('0100 123 4567', 'tenant-9')).toBe('0100 123 4567')
    country = 'Egypt'
    expect(await internationalNumber('0100 123 4567', 'tenant-9')).toBe('+201001234567')
    expect(reads).toBe(2)
  })
})

describe('AI agent trip currency', () => {
  it('labels the draft trip with the run currency the rates are in', () => {
    const agent = src('lib/whatsapp-ai-agent.ts')
    expect(agent).toContain('getTenantRunCurrency(createAdminClient(), this.tenantId)')
    expect(agent).not.toContain("select('default_currency, rates_currency')")
  })
})

describe('blank company name or email', () => {
  it('no bare "**", " Team" or leading " | "', () => {
    const wa = src('app/api/whatsapp/send-supplier-document/route.ts')
    expect(wa).not.toContain('`*${businessName}*\\n\\n` +')
    expect(wa).toContain("(businessName ? `Best regards,\\n${businessName} Team` : 'Best regards')")
    const receipt = src('app/api/whatsapp/send-receipt/route.ts')
    expect(receipt).toContain("(businessEmail ? `📧 ${businessEmail}\\n` : '')")
    const email = src('app/api/send-supplier-document/route.ts')
    expect(email).toContain("[businessName, businessEmail].filter(Boolean)")
  })
})

describe('round 10', () => {
  it('the editor invoice bills the services on screen, with the client', () => {
    const edit = src('app/itineraries/[id]/edit/page.tsx')
    expect(edit).toContain('const amount = effectiveItineraryTotal(itinerary, live)')
    expect(edit).toContain('client_id: itinerary.client_id,')
    expect(edit).not.toContain('unit_price: itinerary.total_cost,')
  })
  it('the invoice form totals every edit by the server rule, and hides tax/discount on a share', () => {
    const form = src('app/invoices/invoices-content.tsx')
    expect(form).not.toContain('prev.subtotal * (rate / 100)')
    expect(form).not.toContain('subtotal * (prev.tax_rate / 100)')
    expect(form).toContain("{formData.invoice_type === 'standard' && (<>")
  })
  it('generate-documents reads only this tenant\'s suppliers', () => {
    expect(src('app/api/itineraries/[id]/generate-documents/route.ts')).toContain(".from('suppliers').select('*').in('id', supplierIds).eq('tenant_id', tenantId)")
  })
  it('a receipt with no payment method prints no "undefined"', () => {
    const r = src('app/api/whatsapp/send-receipt/route.ts')
    expect(r).not.toContain('receipt.paymentMethod?.replace')
    expect(r).toContain('.replace(/_/g, \' \')')
  })
})
