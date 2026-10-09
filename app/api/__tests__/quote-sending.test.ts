// Quotes went out as the platform's, not the agency's: the emails said
// "AUTOURA" and "Egypt", listed hello@getautoura.net and +20 10 8091 6066,
// and came from the platform's address with no reply-to the agency. The
// WhatsApp quote reused a PDF link that expired after a week (or showed the
// old prices after a re-price), promised a fixed list of inclusions, and
// neither send checked for services with no price. A B2B quote could name
// another tenant's partner, and was then emailed to them.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@react-email/render'
import { createElement } from 'react'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({
  quote: null as Row | null,
  tenant: null as Row | null,
  itinerary: null as Row | null,
  partner: null as Row | null,
  services: [] as Row[],
  emails: [] as Row[],
  whatsapp: [] as Row[],
  uploads: [] as string[],
  updates: [] as { table: string; data: Row }[],
}))

function chain(table: string) {
  let mode: 'select' | 'update' = 'select'
  let payload: Row = {}
  const rows = (): unknown => {
    if (table === 'b2c_quotes' || table === 'b2b_quotes') return h.quote
    if (table === 'tenants') return h.tenant
    if (table === 'itineraries') return h.itinerary
    if (table === 'b2b_partners') return h.partner
    if (table === 'itinerary_days') return [{ id: 'd1' }]
    if (table === 'itinerary_services') return h.services
    return null
  }
  const done = () => {
    if (mode === 'update') { h.updates.push({ table, data: payload }); return { data: null, error: null } }
    return { data: rows(), error: null }
  }
  const b: Row = {
    select: () => b, eq: () => b, in: () => b, order: () => b,
    update: (d: Row) => { mode = 'update'; payload = d; return b },
    single: async () => done(), maybeSingle: async () => done(),
    then: (r: (v: unknown) => void) => r(done()),
  }
  return b
}
const db = { from: (t: string) => chain(t) }

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, supabase: db, user: { id: 'u1' }, tenant_id: 't1', role: 'owner' }),
  createAdminClient: () => db,
}))
vi.mock('@/lib/document-identity', () => ({ loadDocumentIdentity: async () => ({ name: 'Atlas Trails' }) }))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => h.tenant }))
vi.mock('@react-pdf/renderer', async (orig) => ({ ...(await orig<object>()), renderToBuffer: async () => Buffer.from('%PDF-') }))
vi.mock('resend', () => ({ Resend: class { emails = { send: async (m: Row) => { h.emails.push(m); return { data: { id: 'e1' }, error: null } } } } }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async (m: Row) => { h.whatsapp.push(m); return { success: true, messageId: 'wa' } } }))
vi.mock('@/lib/storage/shareable-pdf', () => ({
  uploadShareablePdf: async (_db: unknown, o: { fileName: string }) => { h.uploads.push(o.fileName); return { ok: true, url: `https://signed/${o.fileName}`, path: o.fileName } },
}))
vi.mock('@/lib/pricing/itinerary-completeness', () => ({
  loadItineraryCompleteness: async () => ({ ok: true, completeness: { complete: true, gaps: [] } }),
}))

import B2CQuoteEmail from '@/components/emails/B2CQuoteEmail'
import B2BQuoteEmail from '@/components/emails/B2BQuoteEmail'
import { POST as sendEmail } from '@/app/api/quotes/[type]/[id]/send/route'
import { POST as sendWhatsApp } from '@/app/api/quotes/[type]/[id]/send-whatsapp/route'
import { POST as sendItineraryQuote } from '@/app/api/whatsapp/send-quote/route'
import { partnerInTenant } from '@/lib/quotes/partner-in-tenant'

process.env.RESEND_API_KEY = 'test'
process.env.RESEND_FROM_EMAIL = 'quotes@platform.example'

const PLATFORM = /AUTOURA|Autoura|getautoura|\+20 10 8091 6066|Egypt|🐪|🇪🇬/
const ctx = (type: string) => ({ params: Promise.resolve({ type, id: 'q1' }) })
const post = (body: Row = {}) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never

const b2cQuote = (over: Row = {}) => ({
  id: 'q1', quote_number: 'Q-1', tier: 'standard', currency: 'EUR', num_travelers: 2,
  selling_price: 3000, price_per_person: 1500, valid_until: null, client_notes: null, status: 'draft',
  pdf_url: 'https://old/expired.pdf', services_snapshot: [{ name: 'Hotel', total_cost: 900, client_price: 1000 }],
  clients: { full_name: 'Jamie', email: 'jamie@example.com', phone: '+212600000000' },
  itineraries: { itinerary_code: 'IT-1', trip_name: null, start_date: null, end_date: null, total_days: 6 },
  ...over,
})

beforeEach(() => {
  h.emails.length = 0; h.whatsapp.length = 0; h.uploads.length = 0; h.updates.length = 0
  h.tenant = {
    company_name: 'Atlas Trails', tagline: 'Morocco, slowly', contact_email: 'hi@atlas.example',
    company_phone: '+212 5 22', company_website: 'atlas.example',
    email_domain: null, email_from_local: 'quotes', email_domain_status: null,
  }
  h.quote = b2cQuote()
})

describe('the quote emails', () => {
  const company = { name: 'Atlas Trails', email: 'hi@atlas.example', phone: '+212 5 22' }

  it('carry the agency’s name and contacts, never the platform’s', async () => {
    const b2c = await render(createElement(B2CQuoteEmail, {
      clientName: 'Jamie', quoteNumber: 'Q-1', tripName: 'Atlas', startDate: null, duration: 6, numTravelers: 2,
      pricePerPerson: 1500, totalPrice: 3000, currency: 'EUR', viewQuoteUrl: 'https://x', company,
    }))
    const b2b = await render(createElement(B2BQuoteEmail, {
      partnerName: 'P', quoteNumber: 'Q-2', tripName: 'Atlas', startDate: null, duration: 6, tier: 'standard',
      tourLeaderIncluded: false, pricingTable: { 2: { pp: 1500, total: 3000 } }, currency: 'EUR', viewQuoteUrl: 'https://x', company,
    }))
    for (const html of [b2c, b2b]) {
      expect(html).toContain('Atlas Trails')
      expect(html).toContain('hi@atlas.example')
      expect(html).not.toMatch(PLATFORM)
      expect(html).not.toMatch(/1970|Invalid Date/)
    }
  })
})

describe('POST /api/quotes/[type]/[id]/send', () => {
  it('sends as the agency, with replies to the agency, and no Egypt subject', async () => {
    expect((await sendEmail(post(), ctx('b2c'))).status).toBe(200)
    const mail = h.emails[0]
    expect(mail.from).toBe('Atlas Trails <quotes@platform.example>')
    expect(mail.replyTo).toBe('hi@atlas.example')
    expect(mail.subject).toBe('Your Travel Quote - Q-1')
    expect(mail.html).not.toMatch(PLATFORM)
  })

  it('refuses a quote with unpriced services unless the operator confirms', async () => {
    h.quote = b2cQuote({ services_snapshot: [{ service_name: 'Felucca', day_number: 2, unpriced: true }] })
    const refused = await sendEmail(post(), ctx('b2c'))
    expect(refused.status).toBe(422)
    expect((await refused.json()).gaps).toHaveLength(1)
    expect(h.emails).toHaveLength(0)
    expect((await sendEmail(post({ allow_incomplete: true }), ctx('b2c'))).status).toBe(200)
    expect(h.emails).toHaveLength(1)
  })
})

describe('POST /api/quotes/[type]/[id]/send-whatsapp', () => {
  it('attaches a fresh PDF every time, never the stored link', async () => {
    await sendWhatsApp(post(), ctx('b2c'))
    await sendWhatsApp(post(), ctx('b2c'))
    expect(h.whatsapp.map(m => m.mediaUrl)).not.toContain('https://old/expired.pdf')
    expect(h.uploads).toHaveLength(2)
    expect(new Set(h.uploads).size).toBe(2)
  })

  it('speaks for the agency and promises nothing the quote does not', async () => {
    await sendWhatsApp(post(), ctx('b2c'))
    const body = h.whatsapp[0].body as string
    expect(body).toContain('Atlas Trails')
    expect(body).toContain('hi@atlas.example')
    expect(body).not.toMatch(PLATFORM)
    expect(body).not.toContain('All entrance fees')
    expect(body).not.toMatch(/Dates:/) // no dates yet: no line, never today's
  })

  it('refuses unpriced services unless confirmed', async () => {
    h.quote = b2cQuote({ services_snapshot: [{ service_name: 'Felucca', day_number: 2, unpriced: true }] })
    expect((await sendWhatsApp(post(), ctx('b2c'))).status).toBe(422)
    expect(h.whatsapp).toHaveLength(0)
  })
})

describe('POST /api/whatsapp/send-quote (itinerary)', () => {
  const itinerary = (status: string) => ({
    id: 'it-1', status, client_name: 'Jamie', client_phone: '+212600000000', trip_name: 'Atlas', currency: 'EUR',
    total_cost: 0, margin_percent: 25, start_date: '2026-11-01', end_date: '2026-11-07', num_adults: 2, num_children: 0,
  })

  it('goes to the trip’s client at the total the page shows, as the agency', async () => {
    h.itinerary = itinerary('draft')
    h.services = [{ total_cost: 2000, client_price: 2400 }]
    expect((await sendItineraryQuote(post({ itineraryId: 'it-1', clientPhone: '+19999999999' }))).status).toBe(200)
    expect(h.whatsapp[0].to).toBe('+212600000000')
    expect(h.whatsapp[0].body).toContain('EUR 2400.00')
    expect(h.whatsapp[0].body).not.toMatch(PLATFORM)
    expect(h.updates.some(u => u.table === 'itineraries' && u.data.status === 'sent')).toBe(true)
  })

  it('never moves a confirmed trip back to "sent"', async () => {
    h.itinerary = itinerary('confirmed')
    h.services = [{ total_cost: 2000, client_price: 2400 }]
    await sendItineraryQuote(post({ itineraryId: 'it-1' }))
    expect(h.updates.some(u => u.table === 'itineraries')).toBe(false)
  })
})

describe('B2B partners', () => {
  it('must be the tenant’s own', async () => {
    h.partner = null
    expect(await partnerInTenant(db, 'their-partner', 't1')).toMatchObject({ ok: false, status: 404 })
    h.partner = { id: 'p1', default_margin_percent: 0 }
    expect(await partnerInTenant(db, 'p1', 't1')).toEqual({ ok: true, partner: { id: 'p1', default_margin_percent: 0 } })
    expect(await partnerInTenant(db, null, 't1')).toEqual({ ok: true, partner: null })
  })

  it('are checked before a quote is created, and a 0% margin counts', () => {
    for (const f of ['app/api/b2b/quote-from-itinerary/route.ts', 'app/api/quotes/b2b/route.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).toContain('partnerInTenant(supabase, partner_id')
    }
    expect(readFileSync(join(process.cwd(), 'app/api/b2b/quote-from-itinerary/route.ts'), 'utf8')).toContain('default_margin_percent != null')
  })
})
