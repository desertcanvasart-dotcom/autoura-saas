import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paymentCurrencyFor } from '@/lib/payment-currency'
import { recordsInTenant } from '@/lib/quotes/records-in-tenant'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('paymentCurrencyFor', () => {
  it("a payment on a ¥ trip or invoice is in yen, not the form's EUR default", () => {
    expect(paymentCurrencyFor(undefined, 'JPY')).toEqual({ ok: true, currency: 'JPY' })
    expect(paymentCurrencyFor('jpy', 'JPY')).toEqual({ ok: true, currency: 'JPY' })
    expect(paymentCurrencyFor('EUR', 'JPY').ok).toBe(false)
  })
  it('no record currency: the one sent, else EUR', () => {
    expect(paymentCurrencyFor('usd', null)).toEqual({ ok: true, currency: 'USD' })
    expect(paymentCurrencyFor('', undefined)).toEqual({ ok: true, currency: 'EUR' })
  })
  it('every payment write goes through it', () => {
    expect(src('app/api/payments/route.ts')).toContain('paymentCurrencyFor(body.currency, itinerary.currency)')
    expect(src('app/api/payments/[id]/route.ts')).toContain('paymentCurrencyFor(body.currency, itinerary.currency)')
    const inv = src('app/api/invoices/[id]/payments/route.ts')
    expect(inv).toContain('paymentCurrencyFor(body.currency, invoice.currency)')
    expect(inv).not.toContain("currency: body.currency || invoice.currency")
  })
  it('the payment forms take the trip or invoice currency and lock it', () => {
    for (const f of ['app/payments/new/page.tsx', 'app/payments/record/page.tsx', 'app/invoices/[id]/page.tsx']) {
      expect(src(f), f).not.toContain('<option value="EUR">EUR (')
    }
    expect(src('app/payments/new/page.tsx')).toContain('currency: selectedItinerary.currency || prev.currency')
  })
})

describe('recordsInTenant', () => {
  const db = (owned: Record<string, string[]>) => ({
    from: (table: string) => {
      const f: Record<string, string> = {}
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { f[c] = v; return q },
        maybeSingle: async () => ({ data: f.tenant_id === 't1' && (owned[table] ?? []).includes(f.id) ? { id: f.id } : null, error: null }),
      }
      return q
    },
  })
  it("refuses another tenant's client or trip; absent ids pass", async () => {
    const d = db({ clients: ['c1'], itineraries: ['i1'] })
    expect(await recordsInTenant(d, 't1', { client_id: 'c1', itinerary_id: 'i1' })).toEqual({ ok: true })
    expect(await recordsInTenant(d, 't1', {})).toEqual({ ok: true })
    expect(await recordsInTenant(d, 't1', { client_id: 'c2' })).toMatchObject({ ok: false, status: 404 })
    expect(await recordsInTenant(d, 't1', { itinerary_id: 'i2' })).toMatchObject({ ok: false, status: 404 })
    expect(await recordsInTenant(d, 't1', { client_id: { x: 1 } })).toMatchObject({ ok: false, status: 400 })
  })
  it('the B2C and B2B quote POSTs check them', () => {
    expect(src('app/api/quotes/b2c/route.ts')).toContain('recordsInTenant(supabase, authResult.tenant_id, { client_id, itinerary_id })')
    expect(src('app/api/quotes/b2b/route.ts')).toContain('recordsInTenant(supabase, authResult.tenant_id, { itinerary_id })')
  })
})

describe('deposit and final invoices', () => {
  it('need the full trip cost — the typed line no longer stands in for the trip', () => {
    expect(src('app/api/invoices/route.ts')).toContain("A deposit or final invoice needs the trip and its full cost")
    const form = src('app/invoices/invoices-content.tsx')
    expect(form).toContain("Pick the trip for a deposit or final invoice")
    expect(form.match(/readOnly=\{formData\.invoice_type !== 'standard'\}/g)?.length).toBe(2)
  })
})

describe('smaller round 11 fixes', () => {
  it('the payment invoice prints the trip total from its services', () => {
    const r = src('app/api/payments/[id]/route.ts')
    expect(r).toContain('effectiveItineraryTotal(payment.itineraries, services.rows)')
    expect(r).toContain('total_cost: tripTotal')
  })
  it("the share page reads only this tenant's staff contacts", () => {
    expect(src('app/share/[token]/page.tsx')).toContain(".in('id', ids).eq('tenant_id', share.tenant_id)")
  })
  it("a voucher takes the supplier's WhatsApp number", () => {
    expect(src('lib/documents/plan-supplier-documents.ts')).toContain('supplier?.whatsapp || supplier?.contact_phone')
  })
  it('the invoice WhatsApp has no dangling contact line', () => {
    expect(src('app/api/whatsapp/send-invoice/route.ts')).not.toContain('`For questions, contact us:\\n` +')
  })
})
