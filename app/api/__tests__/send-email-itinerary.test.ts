import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '@/lib/__tests__/_mock-supabase'

// ============================================================================
// POST /api/send-email — the itinerary email with the PDF attached.
//
// The page sent totalCost as a STRING (toFixed(2)); the deliverable-price gate
// rejects anything that is not a finite number, so every send answered 422.
// The route now reads the itinerary and its services from the database and
// computes the total itself (lib/itinerary-client-total.ts), so:
//   * a normal itinerary emails, with the database total in the message
//   * a total or currency in the request body is ignored
//   * another tenant's itinerary is not found
//   * an itinerary with no price is still refused (the gate is intact)
// ============================================================================

const TENANT = 'tenant-a'
const sent: Array<{ to: string; html: string; subject: string }> = []

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({
    error: null,
    status: 200,
    supabase: createMockClient(),
    tenant_id: TENANT,
    user: { id: 'u1' },
    role: 'admin',
  }),
}))
vi.mock('@/lib/email-send', () => ({
  sendMail: async (msg: { to: string; html: string; subject: string }) => {
    sent.push(msg)
    return { success: true, messageId: 'm1' }
  },
}))
vi.mock('@/lib/tenant-email-domain', () => ({
  resolveSender: () => ({ from: 'Agency <no-reply@example.com>' }),
}))

import { POST } from '@/app/api/send-email/route'

function post(body: Record<string, unknown>) {
  return POST(new Request('http://x/api/send-email', { method: 'POST', body: JSON.stringify(body) }))
}

function itinerary(over: Record<string, unknown> = {}) {
  return {
    id: 'it-1', tenant_id: TENANT, itinerary_code: 'IT-001', trip_name: 'Nile Week',
    client_name: 'Ada', currency: 'EUR', total_cost: 0, margin_percent: 40, ...over,
  }
}

beforeEach(() => {
  sent.length = 0
  setMockTables({
    tenants: [{ id: TENANT, company_name: 'Agency', contact_email: 'ops@agency.test' }],
    itineraries: [itinerary(), itinerary({ id: 'it-other', tenant_id: 'tenant-b' })],
    itinerary_days: [{ id: 'd1', itinerary_id: 'it-1' }, { id: 'd2', itinerary_id: 'it-1' }],
    itinerary_services: [
      { itinerary_day_id: 'd1', total_cost: 1000, client_price: null },
      { itinerary_day_id: 'd2', total_cost: 100, client_price: 500 },
    ],
  })
})

describe('itinerary email', () => {
  it('sends, with the total computed from the services (1000 × 1.4 + 500)', async () => {
    const res = await post({ itineraryId: 'it-1', clientEmail: 'ada@example.com', clientName: 'Ada' })
    const json = await res.json()
    expect(res.status, JSON.stringify(json)).toBe(200)
    expect(json.success).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].html).toContain('EUR 1900.00')
    expect(sent[0].subject).toContain('Nile Week (IT-001)')
  })

  it('ignores a total and currency sent by the browser', async () => {
    const res = await post({
      itineraryId: 'it-1', clientEmail: 'ada@example.com', totalCost: '1.00', currency: 'USD',
    })
    expect(res.status).toBe(200)
    expect(sent[0].html).toContain('EUR 1900.00')
    expect(sent[0].html).not.toContain('USD')
  })

  it("does not find another tenant's itinerary", async () => {
    const res = await post({ itineraryId: 'it-other', clientEmail: 'ada@example.com' })
    expect(res.status).toBe(404)
    expect(sent).toHaveLength(0)
  })

  it('still refuses an itinerary with no price', async () => {
    setMockTables({
      tenants: [{ id: TENANT }],
      itineraries: [itinerary({ total_cost: 0 })],
      itinerary_days: [],
      itinerary_services: [],
    })
    const res = await post({ itineraryId: 'it-1', clientEmail: 'ada@example.com' })
    expect(res.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('requires the itinerary id', async () => {
    const res = await post({ clientEmail: 'ada@example.com' })
    expect(res.status).toBe(400)
  })
})
