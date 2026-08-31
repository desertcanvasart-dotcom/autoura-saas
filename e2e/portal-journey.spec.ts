// The customer-facing journey, end to end, against a running server.
//
// UNLIKE auth-boundary.spec.ts this suite WRITES, so it is gated three ways
// and skips entirely unless all three hold:
//
//   1. E2E_SUPABASE_URL + E2E_SUPABASE_SERVICE_ROLE_KEY are set (a dedicated
//      throwaway project -- see docs/E2E.md), and
//   2. E2E_TENANT_ID names a tenant, and
//   3. that tenant carries settings.e2e_fixture === true.
//
// (3) is the one that matters. A harness that picks "the first tenant" will
// one day pick a real agency's: on 2026-08-30 exactly that seeded into a live
// tenant and the chat's notify path emailed their real contact address. The
// fixture tenant must say out loud that it is disposable.
//
// Everything created here is removed in afterAll, in reverse order.
import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// The app's own token generators, so a change to the token format cannot
// leave this suite minting tokens the routes will reject.
import { generatePortalToken } from '../lib/booking-portal'
import { generateShareToken } from '../lib/itinerary-share'

const URL = process.env.E2E_SUPABASE_URL
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = process.env.E2E_TENANT_ID
const configured = !!(URL && SERVICE_KEY && TENANT_ID && !URL.includes('placeholder'))


// The verify gate issues its cookie with `secure` under NODE_ENV=production
// (correct: the portal is served over HTTPS in production). This suite drives
// `next start` over plain http://127.0.0.1, where a secure cookie is not
// stored or replayed by any conforming client -- so the session carries the
// Set-Cookie value forward itself. The server still issues it, validates its
// HMAC, and refuses without it; only the transport differs.
class Session {
  private cookie = ''
  constructor(private ctx: APIRequestContext) {}

  private absorb(res: APIResponse) {
    for (const h of res.headersArray()) {
      if (h.name.toLowerCase() !== 'set-cookie') continue
      for (const line of h.value.split('\n')) {
        const pair = line.split(';')[0].trim()
        if (!pair.includes('=')) continue
        const name = pair.slice(0, pair.indexOf('='))
        const rest = this.cookie
          .split('; ')
          .filter((c) => c && !c.startsWith(`${name}=`))
        this.cookie = [...rest, pair].join('; ')
      }
    }
  }

  private opts(o: Record<string, unknown> = {}) {
    return this.cookie
      ? { ...o, headers: { ...((o.headers as object) ?? {}), cookie: this.cookie } }
      : o
  }

  async get(url: string) {
    const res = await this.ctx.get(url, this.opts())
    this.absorb(res)
    return res
  }
  async post(url: string, o: Record<string, unknown> = {}) {
    const res = await this.ctx.post(url, this.opts(o))
    this.absorb(res)
    return res
  }
  async put(url: string, o: Record<string, unknown> = {}) {
    const res = await this.ctx.put(url, this.opts(o))
    this.absorb(res)
    return res
  }
  dispose() { return this.ctx.dispose() }
}

test.describe.configure({ mode: 'serial' })

test.describe('customer portal journey', () => {
  test.skip(!configured, 'needs E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY and E2E_TENANT_ID (docs/E2E.md)')

  let db: SupabaseClient
  let bookingId: string
  let clientId: string
  let itineraryId: string
  let secondPaxId: string
  let portalToken: string
  let privateToken: string
  let shareToken: string
  let documentPath: string | null = null
  const bookingNumber = `E2E-${Date.now()}`

  // Two independent cookie jars: the booking-level link and the private
  // per-traveller link must be verified separately.
  let lead: Session
  let traveller: Session
  let visitor: Session

  test.beforeAll(async ({ playwright, baseURL }) => {
    db = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } })

    const { data: tenant } = await db
      .from('tenants')
      .select('id, company_name, settings')
      .eq('id', TENANT_ID!)
      .maybeSingle()
    if (!tenant || tenant.settings?.e2e_fixture !== true) {
      throw new Error(
        `Refusing to run: tenant ${TENANT_ID} is not marked settings.e2e_fixture === true. ` +
          'Run scripts/seed-e2e-tenant.mjs against a throwaway project.'
      )
    }

    const mk = async () => new Session(await playwright.request.newContext({ baseURL }))
    ;[lead, traveller, visitor] = await Promise.all([mk(), mk(), mk()])

    const { data: itin } = await db
      .from('itineraries')
      .insert({
        tenant_id: TENANT_ID, itinerary_code: bookingNumber, client_name: 'E2E Fixture',
        start_date: '2027-01-10', end_date: '2027-01-14',
      })
      .select('id').single().throwOnError()
    itineraryId = itin!.id

    const { data: client } = await db
      .from('clients')
      .insert({ tenant_id: TENANT_ID, full_name: 'E2E Fixture', last_name: 'Fixture', email: 'e2e-sink@example.invalid' })
      .select('id').single().throwOnError()
    clientId = client!.id

    const { data: booking } = await db
      .from('bookings')
      .insert({
        tenant_id: TENANT_ID, itinerary_id: itineraryId, quote_id: itineraryId, quote_type: 'b2c',
        client_id: clientId, booking_number: bookingNumber, booking_date: '2026-08-31',
        trip_name: 'E2E Portal Journey', start_date: '2027-01-10', end_date: '2027-01-14',
        total_days: 5, num_travelers: 2, total_amount: 1000, currency: 'EUR',
        deposit_amount: 0, total_paid: 0, balance_due: 1000, status: 'confirmed',
      })
      .select('id, start_date').single().throwOnError()
    bookingId = booking!.id

    const { data: pax } = await db
      .from('booking_passengers')
      .insert([
        { tenant_id: TENANT_ID, booking_id: bookingId, first_name: 'Lead', last_name: 'Fixture',
          passenger_type: 'adult', is_lead_passenger: true },
        { tenant_id: TENANT_ID, booking_id: bookingId, first_name: 'Second', last_name: 'Traveller',
          passenger_type: 'adult', is_lead_passenger: false, date_of_birth: '1990-05-05' },
      ])
      .select('id, first_name').throwOnError()
    secondPaxId = pax!.find((p) => p.first_name === 'Second')!.id

    // Staff mints the booking-level link. Done through the table rather than
    // the staff API because that route needs a signed-in session; the portal
    // side -- everything under test -- is token-authenticated and real.
    const { data: link } = await db
      .from('booking_portal_links')
      .insert({ tenant_id: TENANT_ID, booking_id: bookingId, passenger_id: null, token: generatePortalToken() })
      .select('token').single().throwOnError()
    portalToken = link!.token

    const { data: share } = await db
      .from('itinerary_shares')
      .insert({ tenant_id: TENANT_ID, itinerary_id: itineraryId, token: generateShareToken(), view_count: 0 })
      .select('token').single().throwOnError()
    shareToken = share!.token
  })

  test.afterAll(async () => {
    if (!configured || !db) return
    if (documentPath) await db.storage.from('traveller-documents').remove([documentPath])
    await db.from('booking_passenger_documents').delete().eq('passenger_id', secondPaxId)

    // The conversation the chat message anchored to must be removed by its
    // own id: the route creates it with client_id taken from the ITINERARY,
    // which this fixture leaves null, so deleting by client_id alone matched
    // nothing and leaked a row on every run.
    const { data: msgs } = await db
      .from('trip_messages')
      .select('unified_conversation_id')
      .eq('itinerary_id', itineraryId)
    const conversationIds = [...new Set((msgs ?? []).map((m) => m.unified_conversation_id).filter(Boolean))]
    await db.from('trip_messages').delete().eq('itinerary_id', itineraryId)
    if (conversationIds.length) await db.from('unified_conversations').delete().in('id', conversationIds)
    await db.from('itinerary_shares').delete().eq('itinerary_id', itineraryId)
    await db.from('booking_change_requests').delete().eq('booking_id', bookingId)
    await db.from('booking_portal_links').delete().eq('booking_id', bookingId)
    await db.from('booking_passengers').delete().eq('booking_id', bookingId)
    await db.from('bookings').delete().eq('id', bookingId)
    await db.from('clients').delete().eq('id', clientId)
    await db.from('itineraries').delete().eq('id', itineraryId)
    await Promise.all([lead?.dispose(), traveller?.dispose(), visitor?.dispose()])
  })

  // ---------- the confirmation gate ----------

  test('portal page loads for an unverified visitor', async () => {
    const res = await visitor.get(`/portal/${portalToken}`)
    expect(res.status()).toBe(200)
  })

  test('traveller data is unreachable before verifying', async () => {
    const res = await visitor.get(`/api/portal/${portalToken}/travellers`)
    expect(res.status()).toBe(404)
  })

  test('gate rejects a wrong answer', async () => {
    const res = await visitor.post(`/api/portal/${portalToken}/verify`, { data: { answer: 'Definitely Wrong' } })
    expect(res.status()).toBe(403)
  })

  test('gate accepts the booking number', async () => {
    const res = await lead.post(`/api/portal/${portalToken}/verify`, { data: { answer: bookingNumber } })
    expect(res.status()).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  // ---------- traveller details ----------

  test('booking-level link lists every traveller', async () => {
    const res = await lead.get(`/api/portal/${portalToken}/travellers`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.travellers).toHaveLength(2)
    expect(body.scope).toBe('booking')
  })

  test('traveller details save and persist', async () => {
    const res = await lead.put(`/api/portal/${portalToken}/travellers`, {
      data: { id: secondPaxId, passport_number: 'X1234567', nationality: 'Japan', meal_preference: 'vegetarian' },
    })
    expect(res.status()).toBe(200)
    const { data } = await db.from('booking_passengers').select('passport_number, nationality').eq('id', secondPaxId).maybeSingle()
    expect(data?.passport_number).toBe('X1234567')
    expect(data?.nationality).toBe('Japan')
  })

  test('portal cannot write identity or linkage columns', async () => {
    await lead.put(`/api/portal/${portalToken}/travellers`, {
      data: { id: secondPaxId, tenant_id: '00000000-0000-0000-0000-000000000000', is_lead_passenger: true },
    })
    const { data } = await db.from('booking_passengers').select('tenant_id, is_lead_passenger').eq('id', secondPaxId).maybeSingle()
    expect(data?.tenant_id).toBe(TENANT_ID)
    expect(data?.is_lead_passenger).toBe(false)
  })

  // ---------- per-traveller private links ----------

  test('lead mints a private per-traveller link', async () => {
    const res = await lead.post(`/api/portal/${portalToken}/coordinator`, { data: { passenger_id: secondPaxId } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    privateToken = body.token ?? String(body.url ?? '').split('/portal/')[1]
    expect(privateToken).toBeTruthy()
  })

  test('private link demands family name AND date of birth', async () => {
    const nameOnly = await traveller.post(`/api/portal/${privateToken}/verify`, { data: { answer: 'Traveller' } })
    expect(nameOnly.status()).toBe(403)

    const both = await traveller.post(`/api/portal/${privateToken}/verify`, { data: { answer: 'Traveller', dob: '1990-05-05' } })
    expect(both.status()).toBe(200)
  })

  test('private link is scoped to its own traveller', async () => {
    const res = await traveller.get(`/api/portal/${privateToken}/travellers`)
    const body = await res.json()
    expect(body.travellers).toHaveLength(1)
    expect(body.travellers[0].id).toBe(secondPaxId)
    expect(body.scope).toBe('traveller')
  })

  // ---------- documents ----------

  test('traveller uploads a document into the private bucket', async () => {
    // 1x1 PNG: enough to exercise the type sniff, the storage write and the row.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    const res = await lead.post(`/api/portal/${portalToken}/travellers/${secondPaxId}/documents`, {
      multipart: {
        file: { name: 'passport.png', mimeType: 'image/png', buffer: png },
        kind: 'passport',
        label: 'E2E passport scan',
      },
    })
    expect(res.status()).toBe(200)

    const { data } = await db
      .from('booking_passenger_documents')
      .select('id, storage_path, kind')
      .eq('passenger_id', secondPaxId)
      .maybeSingle()
    expect(data?.storage_path).toBeTruthy()
    expect(data?.kind).toBe('passport')
    documentPath = data!.storage_path

    const listed = await lead.get(`/api/portal/${portalToken}/travellers/${secondPaxId}/documents`)
    const body = await listed.json()
    expect((body.documents ?? body.data ?? []).length).toBe(1)
  })

  test('an uploaded passport is not publicly downloadable', async ({ request }) => {
    expect(documentPath).toBeTruthy()
    const res = await request.get(`${URL}/storage/v1/object/public/traveller-documents/${documentPath}`)
    expect(res.status(), 'the traveller-documents bucket must be private').not.toBe(200)
  })

  // ---------- change requests ----------

  test('customer change request reaches the operator', async () => {
    const res = await lead.post(`/api/portal/${portalToken}/change-request`, {
      data: { count: 3, note: 'E2E: we would like to add one person' },
    })
    expect(res.status()).toBe(200)
    const { data } = await db
      .from('booking_change_requests')
      .select('kind, requested_count, status')
      .eq('booking_id', bookingId)
      .maybeSingle()
    expect(data).toMatchObject({ kind: 'add_traveller', requested_count: 3, status: 'pending' })
  })

  // ---------- chat, on the share surface ----------

  test('share page loads and the chat history endpoint answers', async () => {
    expect((await visitor.get(`/share/${shareToken}`)).status()).toBe(200)
    const res = await visitor.get(`/api/share/${shareToken}/messages`)
    expect(res.status()).toBe(200)
  })

  test('a customer message is stored and reaches a staff conversation', async () => {
    const sent = await visitor.post(`/api/share/${shareToken}/messages`, {
      data: { message: 'E2E: hello from the customer', name: 'E2E Fixture' },
    })
    expect(sent.status()).toBe(200)

    const history = await visitor.get(`/api/share/${shareToken}/messages`)
    const body = await history.json()
    const messages = body.data ?? body.messages ?? []
    expect(messages.some((m: { content: string }) => m.content.includes('hello from the customer'))).toBe(true)

    const { data } = await db
      .from('trip_messages')
      .select('direction, unified_conversation_id')
      .eq('itinerary_id', itineraryId)
      .maybeSingle()
    expect(data?.direction).toBe('inbound')
    // The message must anchor to a conversation, or staff never see it.
    expect(data?.unified_conversation_id).toBeTruthy()
  })

  test('the staff notification path records an outcome', async () => {
    // notifyTripMessage is fire-and-forget, so poll rather than assume a
    // value is already stamped. The OUTCOME is environment-dependent (no mail
    // credentials in CI); what must hold is that silence is diagnosable.
    await expect
      .poll(async () => {
        const { data } = await db
          .from('trip_messages')
          .select('notify_outcome')
          .eq('itinerary_id', itineraryId)
          .maybeSingle()
        return data?.notify_outcome ?? null
      }, { timeout: 15_000, message: 'notify_outcome was never stamped' })
      .not.toBeNull()
  })

  // ---------- revocation ----------

  test('revoking a link locks it immediately', async () => {
    await db
      .from('booking_portal_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .is('passenger_id', null)
    const res = await lead.get(`/api/portal/${portalToken}/travellers`)
    expect(res.status()).toBe(404)
  })
})
