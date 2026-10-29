import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  attributionOf, createWaRef, matchWaRef, newRefToken, recordWebEnquiry, refTokenIn, EnquiryRejected,
} from '@/lib/publish/enquiries'
import { enquiryInputSchema, type EnquiryInput } from '@/lib/publish/contract'

// ============================================================================
// Lead capture from a company's Publish website (step 8, PLAN §11), against an
// in-memory database shaped like Supabase's answers. What it proves:
//   · a form enquiry becomes ONE lead per person (email, then phone), an
//     enquiry row with the page, tour, campaign and utm it came from, a note,
//     and a bell notice — and never lands on another company;
//   · a company without its own WhatsApp number gets no button (Q7);
//   · a WhatsApp reference is claimed once, by its own company only.
// ============================================================================

const T = 'tenant-a', OTHER = 'tenant-b', SITE = '11111111-1111-4111-8111-111111111111'
const PAGE = '22222222-2222-4222-8222-222222222222', FOREIGN_PAGE = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown>
let seq = 0

function makeDb(tables: Record<string, Row[]>) {
  const embed = (table: string, row: Row): Row =>
    table === 'publish_pages' ? { ...row, tour_templates: tables.tour_templates.find(t => t.id === row.tour_template_id) ?? null } : row
  return {
    tables,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let limit = Infinity
      let op: { kind: 'select' } | { kind: 'insert'; rows: Row[] } | { kind: 'update'; patch: Row } = { kind: 'select' }
      const exec = (): { data: unknown; error: { message: string; code?: string } | null } => {
        tables[table] ??= []
        if (op.kind === 'insert') {
          const inserted: Row[] = []
          for (const r of op.rows) {
            if (table === 'publish_wa_refs' && tables[table].some(x => x.token === r.token)) {
              return { data: null, error: { message: 'duplicate key', code: '23505' } }
            }
            const row = { id: `${table}-${++seq}`, ...r }
            tables[table].push(row); inserted.push(row)
          }
          return { data: inserted, error: null }
        }
        const hit = tables[table].filter(x => filters.every(f => f(x))).slice(0, limit)
        if (op.kind === 'update') { for (const h of hit) Object.assign(h, op.patch); return { data: hit, error: null } }
        return { data: hit.map(x => embed(table, x)), error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
        limit: (n: number) => { limit = n; return q },
        insert: (r: Row | Row[]) => { op = { kind: 'insert', rows: Array.isArray(r) ? r : [r] }; return q },
        update: (patch: Row) => { op = { kind: 'update', patch }; return q },
        maybeSingle: async () => { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
        single: async () => { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
        then: (res: (v: unknown) => unknown) => res(exec()),
      }
      return q
    },
  }
}

let db: ReturnType<typeof makeDb>
const notify = vi.fn(async () => {})

beforeEach(() => {
  seq = 0
  notify.mockReset()
  db = makeDb({
    tenants: [{ id: T, whatsapp_number: '+201551772258' }, { id: OTHER, whatsapp_number: null }],
    publish_sites: [{ id: SITE, tenant_id: T, status: 'draft' }],
    publish_pages: [
      { id: PAGE, site_id: SITE, tenant_id: T, tour_template_id: 'tour-a' },
      { id: FOREIGN_PAGE, site_id: 'other-site', tenant_id: OTHER, tour_template_id: 'tour-x' },
    ],
    tour_templates: [{ id: 'tour-a', template_name: 'Saqqara and the First Pyramids' }, { id: 'tour-x', template_name: 'Not ours' }],
    clients: [{ id: 'client-existing', tenant_id: T, email: 'ana@example.com', phone: null }],
    client_notes: [], publish_enquiries: [], publish_wa_refs: [],
  })
})

const input = (over: Partial<EnquiryInput> = {}): EnquiryInput => enquiryInputSchema.parse({
  siteId: SITE, pageId: PAGE, language: 'en', name: 'Lena Fischer', email: 'Lena@Example.com', phone: '',
  travellers: 2, travelDate: '2027-03', message: 'We would like a guide who speaks German.',
  landingUrl: 'https://sandbox.example/en/tours/saqqara?utm_source=google&utm_medium=cpc&utm_campaign=spring',
  visitorIp: '203.0.113.9', ...over,
})

describe('the enquiry form', () => {
  it('makes a lead, an enquiry with its page, tour and campaign, a note, and a bell notice', async () => {
    const { enquiryId, clientId } = await recordWebEnquiry(db as never, input(), { notify })
    const lead = db.tables.clients.find(c => c.id === clientId)!
    expect(lead).toMatchObject({ tenant_id: T, first_name: 'Lena', last_name: 'Fischer', email: 'lena@example.com', status: 'lead', client_source: 'website', phone: null })
    expect(db.tables.publish_enquiries.find(e => e.id === enquiryId)).toMatchObject({
      tenant_id: T, site_id: SITE, page_id: PAGE, client_id: clientId, source: 'web_form', tour_template_id: 'tour-a',
      campaign: 'spring', utm: { source: 'google', medium: 'cpc', campaign: 'spring' },
      dates: { from: '2027-03' }, travellers: 2, language: 'en',
    })
    expect(db.tables.client_notes[0].note_text).toContain('[Website enquiry about Saqqara and the First Pyramids] travel 2027-03, 2 travellers.')
    expect(db.tables.client_notes[0].note_text).toContain('speaks German')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: T, type: 'publish_enquiry', link: `/clients/${clientId}` }))
  })

  it('a person who enquires again is the same lead, not a second one', async () => {
    const { clientId } = await recordWebEnquiry(db as never, input({ email: 'ana@example.com' }), { notify })
    expect(clientId).toBe('client-existing')
    expect(db.tables.clients).toHaveLength(1)
  })

  it('the Contact page\'s fuller form: each answer its own column; a new lead takes WhatsApp, country and interests', async () => {
    const { enquiryId, clientId } = await recordWebEnquiry(db as never, input({ pageId: null, travelDate: '2026-12-10', travellers: 3,
      whatsapp: '+34 600 000 000', country: 'Spain', nights: 7, adults: 2, children: 1, interests: ['Luxor', 'Aswan'], consent: true }), { notify })
    const e = db.tables.publish_enquiries.find(x => x.id === enquiryId)!
    expect(e).toMatchObject({ whatsapp: '+34 600 000 000', country: 'Spain', nights: 7, adults: 2, children: 1, interests: ['Luxor', 'Aswan'], dates: { from: '2026-12-10' } })
    expect(typeof e.consent_at).toBe('string')
    expect(db.tables.clients.find(c => c.id === clientId)).toMatchObject({ whatsapp: '+34 600 000 000', country: 'Spain', special_interests: ['Luxor', 'Aswan'] })
    expect(db.tables.client_notes[0].note_text).toContain('travel 2026-12-10, 7 nights, 2 adults, 1 child, WhatsApp +34 600 000 000, from Spain, interested in Luxor, Aswan.')
  })

  it('an existing lead keeps what it had: only empty details are filled, interests are added', async () => {
    Object.assign(db.tables.clients[0], { whatsapp: '+20 100 000 0000', country: null, special_interests: ['Cairo'] })
    await recordWebEnquiry(db as never, input({ email: 'ana@example.com', whatsapp: '+34 600 000 000', country: 'Spain', interests: ['Luxor', 'Cairo'] }), { notify })
    expect(db.tables.clients[0]).toMatchObject({ whatsapp: '+20 100 000 0000', country: 'Spain', special_interests: ['Cairo', 'Luxor'] })
  })

  it('without consent there is no consent time; the tour form\'s enquiries leave the new columns empty', async () => {
    const { enquiryId } = await recordWebEnquiry(db as never, input(), { notify })
    expect(db.tables.publish_enquiries.find(x => x.id === enquiryId)).toMatchObject({ whatsapp: null, country: null, nights: null, adults: null, children: null, interests: [], consent_at: null })
  })

  it('a page of another company is dropped — the enquiry stays on the site the hostname served', async () => {
    const { enquiryId } = await recordWebEnquiry(db as never, input({ pageId: FOREIGN_PAGE }), { notify })
    const e = db.tables.publish_enquiries.find(x => x.id === enquiryId)!
    expect(e).toMatchObject({ tenant_id: T, page_id: null, tour_template_id: null })
  })

  it('a suspended or unknown site takes nothing', async () => {
    db.tables.publish_sites[0].status = 'suspended'
    await expect(recordWebEnquiry(db as never, input(), { notify })).rejects.toBeInstanceOf(EnquiryRejected)
    expect(db.tables.clients).toHaveLength(1)
    expect(db.tables.publish_enquiries).toHaveLength(0)
  })

  it('a bell that fails does not lose the enquiry', async () => {
    notify.mockRejectedValueOnce(new Error('bell down'))
    await recordWebEnquiry(db as never, input(), { notify })
    expect(db.tables.publish_enquiries).toHaveLength(1)
  })

  it('refuses a missing name or a bad email before anything is written', () => {
    expect(enquiryInputSchema.safeParse({ ...input(), name: '  ' }).success).toBe(false)
    expect(enquiryInputSchema.safeParse({ ...input(), email: 'not-an-email' }).success).toBe(false)
  })
})

describe('attribution', () => {
  it('reads utm_* and campaign from the landing URL', () => {
    expect(attributionOf('https://x.example/en?campaign=nile&utm_source=fb')).toEqual({ utm: { source: 'fb' }, campaign: 'nile' })
    expect(attributionOf('https://x.example/en?utm_campaign=winter')).toEqual({ utm: { campaign: 'winter' }, campaign: 'winter' })
    expect(attributionOf(null)).toEqual({ utm: {}, campaign: null })
    expect(attributionOf('not a url')).toEqual({ utm: {}, campaign: null })
  })
})

describe('click-to-WhatsApp', () => {
  it('gives the company its own number and a fresh reference with the tour name', async () => {
    const ref = await createWaRef(db as never, { siteId: SITE, pageId: PAGE, language: 'en', landingUrl: 'https://sandbox.example/en/tours/saqqara?campaign=spring' })
    expect(ref.number).toBe('+201551772258')
    expect(ref.tourName).toBe('Saqqara and the First Pyramids')
    expect(ref.token).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(db.tables.publish_wa_refs[0]).toMatchObject({ token: ref.token, tenant_id: T, page_id: PAGE, campaign: 'spring' })
  })

  it('a company on the shared number gets no button and no reference (Q7)', async () => {
    db.tables.tenants[0].whatsapp_number = null
    expect(await createWaRef(db as never, { siteId: SITE, pageId: PAGE, language: 'en', landingUrl: null })).toEqual({ number: null, token: null, tourName: null })
    expect(db.tables.publish_wa_refs).toHaveLength(0)
  })

  it('the message that carries the reference records the enquiry — once, and only for its own company', async () => {
    const { token } = await createWaRef(db as never, { siteId: SITE, pageId: PAGE, language: 'en', landingUrl: 'https://sandbox.example/en?utm_source=ig' })
    const body = `Hello, I am interested in Saqqara.\n\nRef: ${token!.toLowerCase()}`

    expect(await matchWaRef(db as never, { tenantId: OTHER, body, conversationId: 'conv-x', clientId: null })).toBeNull()
    const id = await matchWaRef(db as never, { tenantId: T, body, conversationId: 'conv-1', clientId: 'client-existing' })
    expect(db.tables.publish_enquiries.find(e => e.id === id)).toMatchObject({
      tenant_id: T, source: 'whatsapp', page_id: PAGE, tour_template_id: 'tour-a', client_id: 'client-existing',
      whatsapp_conversation_id: 'conv-1', ref_token: token, utm: { source: 'ig' },
    })
    expect(await matchWaRef(db as never, { tenantId: T, body, conversationId: 'conv-1', clientId: 'client-existing' })).toBeNull()
    expect(db.tables.publish_enquiries).toHaveLength(1)
  })

  it('reads the reference however it is written, and nothing else', () => {
    expect(refTokenIn('Ref: ABCD2345')).toBe('ABCD2345')
    expect(refTokenIn('hi\nref abcd2345 thanks')).toBe('ABCD2345')
    expect(refTokenIn('Reference please')).toBeNull()
    expect(refTokenIn(null)).toBeNull()
  })

  it('references avoid the letters people misread', () => {
    for (let i = 0; i < 200; i++) expect(newRefToken()).not.toMatch(/[01IO]/)
  })
})
