import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  confirmationRecipient, confirmationLines, confirmationText, confirmationEmail, fromWithCompany,
  type ConfirmationBooking,
} from '@/lib/bookings/confirmation-message'

// Step 3 of the booking work (compared with travel-ops-pro, 2026-09-25):
// "Send Email" / "WhatsApp" on a booking built a message and never sent it,
// and refused every booking made by confirming an itinerary.

// BK-2026-0003's shape: direct (no quote), no CRM client, contact on the itinerary.
const bk3: ConfirmationBooking = {
  booking_number: 'BK-2026-0003', trip_name: 'Cairo, Alexandria & Siwa Oasis Desert Adventure',
  start_date: '2026-11-01', end_date: '2026-11-11', num_travelers: 4, currency: 'USD',
  total_amount: 579.44, total_paid: 0, balance_due: 579.44, deposit_amount: 173.83, payment_deadline: '2026-10-01',
  clients: null,
  itineraries: { client_name: 'Narcis', client_email: 'poch.narcis@gmail.com', client_phone: '+34630970990' },
}

describe('the confirmation message', () => {
  it("a direct booking with no CRM client uses the itinerary's contact", () => {
    expect(confirmationRecipient(bk3)).toEqual({ name: 'Narcis', email: 'poch.narcis@gmail.com', whatsapp: '+34630970990' })
  })
  it("the CRM client wins, and WhatsApp falls back to the client's phone", () => {
    const r = confirmationRecipient({ ...bk3, clients: { full_name: 'Narcis P', email: 'n@x.com', phone: '+3411', whatsapp: null } })
    expect(r).toEqual({ name: 'Narcis P', email: 'n@x.com', whatsapp: '+3411' })
  })
  it('states the money: total, paid, balance, the deposit due now, and the date', () => {
    expect(confirmationLines(bk3)).toEqual([
      { label: 'Booking number', value: 'BK-2026-0003' },
      { label: 'Trip', value: 'Cairo, Alexandria & Siwa Oasis Desert Adventure' },
      { label: 'Dates', value: '1 November 2026 – 11 November 2026' },
      { label: 'Travellers', value: '4' },
      { label: 'Total', value: 'USD 579.44' },
      { label: 'Paid', value: 'USD 0.00' },
      { label: 'Balance due', value: 'USD 579.44' },
      { label: 'Deposit due now', value: 'USD 173.83' },
      { label: 'Payment due by', value: '1 October 2026' },
    ])
  })
  it('paid in full: no balance lines', () => {
    const labels = confirmationLines({ ...bk3, total_paid: 579.44, balance_due: 0 }).map(l => l.label)
    expect(labels).not.toContain('Balance due')
    expect(labels).not.toContain('Deposit due now')
  })
  it("is in the operator's name, and the email escapes what the client typed", () => {
    expect(confirmationText(bk3, 'Travel2Egypt')).toMatch(/^\*Travel2Egypt\*\n\nDear Narcis,/)
    const { subject, html } = confirmationEmail({ ...bk3, special_requests: '<script>x</script>' }, 'Travel2Egypt')
    expect(subject).toBe('Booking confirmed — BK-2026-0003 · Cairo, Alexandria & Siwa Oasis Desert Adventure')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('the sender name is the company, on the verified address', () => {
    expect(fromWithCompany('Travel2Egypt', 'Autoura <notifications@getautoura.net>')).toBe('Travel2Egypt <notifications@getautoura.net>')
    expect(fromWithCompany('Evil <x@y>', 'a@b.com')).toBe('Evil x@y <a@b.com>')
    expect(fromWithCompany('', undefined)).toBe('notifications@getautoura.net')
  })
})

// ---- the route actually sends ----
const sent: { email: unknown[]; whatsapp: unknown[] } = { email: [], whatsapp: [] }
let row: Record<string, unknown> | null = null
let role = 'manager'

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', role, user: { id: 'u1' } }),
  createAdminClient: () => {
    const c = { from: () => c, select: () => c, eq: () => c, maybeSingle: async () => ({ data: row, error: null }) }
    return c
  },
}))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => ({ company_name: 'Travel2Egypt', contact_email: 'hello@travel2egypt.org' }) }))
vi.mock('@/lib/email', () => ({ sendSystemEmail: async (m: unknown) => { sent.email.push(m); return { sent: true, id: 'e1' } } }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async (m: unknown) => { sent.whatsapp.push(m); return { success: true, messageId: 'w1' } } }))

async function send(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/bookings/[id]/send-confirmation/route')
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: 'b1' }) })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  sent.email.length = 0; sent.whatsapp.length = 0; role = 'manager'
  row = { ...bk3, quote_type: null }
})

describe('POST send-confirmation', () => {
  it('emails a DIRECT booking (it used to refuse it), from the company, replies to the company', async () => {
    const r = await send({ send_via: 'email' })
    expect(r.status).toBe(200)
    expect(sent.email).toHaveLength(1)
    expect(sent.email[0]).toMatchObject({ to: 'poch.narcis@gmail.com', replyTo: 'hello@travel2egypt.org', from: expect.stringMatching(/^Travel2Egypt </) })
  })
  it('sends by WhatsApp to the phone on file', async () => {
    const r = await send({ send_via: 'whatsapp' })
    expect(r.status).toBe(200)
    expect(sent.whatsapp[0]).toMatchObject({ to: '+34630970990' })
  })
  it('a partner booking is refused; a member is refused; no address is a clear 400', async () => {
    row = { ...bk3, quote_type: 'b2b' }
    expect((await send({ send_via: 'email' })).status).toBe(400)
    row = { ...bk3, quote_type: null }; role = 'member'
    expect((await send({ send_via: 'email' })).status).toBe(403)
    role = 'manager'; row = { ...bk3, quote_type: null, itineraries: { client_name: 'X' } }
    const r = await send({ send_via: 'email' })
    expect(r.status).toBe(400)
    expect(sent.email).toHaveLength(0)
  })
})
