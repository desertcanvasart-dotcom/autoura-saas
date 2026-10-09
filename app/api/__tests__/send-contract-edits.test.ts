// The WhatsApp "Send Contract" rebuilt the contract from the database, so the
// client never received what the operator edited on the contract page, and a
// trip with no name went out as "Egypt Tour".
import { describe, it, expect, vi, beforeEach } from 'vitest'

// What the route handed the PDF generator and WhatsApp.
type Captured = { terms: Record<string, unknown>; settings: unknown; tourName: string; totalCost: number | null; to: string; body: string }

const h = vi.hoisted(() => ({ pdfArgs: [] as Captured[], messages: [] as Captured[] }))

function db(rows: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) b[m] = () => b
      b.single = async () => ({ data: rows[table], error: null })
      b.maybeSingle = async () => ({ data: rows[table], error: null })
      b.then = (r: (v: unknown) => void) => r({ data: rows[table] ?? [], error: null })
      return b
    },
  }
}
const itinerary = {
  id: 'it-1', client_name: 'Jamie', client_phone: '+201000000000', start_date: '2026-11-01', end_date: '2026-11-08',
  trip_name: null, total_cost: null, currency: 'USD', num_adults: 2, num_children: 0,
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: db({ itineraries: itinerary, itinerary_days: [] }) }),
  createAdminClient: () => db({ tenants: { operating_country: 'Egypt', contract_governing_law: 'Egyptian law', deposit_percent: 25 } }),
}))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => ({ company_name: 'Nile Journeys' }) }))
vi.mock('@/lib/storage/shareable-pdf', () => ({ uploadShareablePdf: async () => ({ ok: true, url: 'https://signed' }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async (m: Captured) => { h.messages.push(m); return { success: true, messageId: 'wa' } } }))
vi.mock('@/lib/contract-pdf-generator', () => ({ generateContractPDF: async (d: Captured) => { h.pdfArgs.push(d); return new Uint8Array([1]) } }))

import { POST } from '@/app/api/whatsapp/send-contract/route'

const send = (body: Record<string, unknown>) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ itineraryId: 'it-1', ...body }) }) as never)

beforeEach(() => { h.pdfArgs.length = 0; h.messages.length = 0 })

describe('POST /api/whatsapp/send-contract', () => {
  it('sends the contract as edited on the page, with the operator’s country and law', async () => {
    const res = await send({ contract: { paymentTerms: 'A 30% deposit now.', inclusions: ['Balloon'], tourName: 'Nile & Sinai', totalCost: 4200, clientPhone: '+1999' } })
    expect(res.status).toBe(200)
    const pdf = h.pdfArgs[0]
    expect(pdf.terms.paymentTerms).toBe('A 30% deposit now.')
    expect(pdf.terms.inclusions).toEqual(['Balloon'])
    expect(pdf.tourName).toBe('Nile & Sinai')
    expect(pdf.totalCost).toBe(4200)
    expect(pdf.settings).toEqual({ operatingCountry: 'Egypt', governingLaw: 'Egyptian law', depositPercent: 25 })
    // The recipient is the trip's client, never one named in the request.
    expect(h.messages[0].to).toBe('+201000000000')
  })

  it('names no invented tour and no 0.00 price when the trip has neither', async () => {
    await send({})
    expect(h.pdfArgs[0].tourName).toBe('Your tour')
    expect(h.pdfArgs[0].totalCost).toBeNull()
    expect(h.messages[0].body).toContain('To be confirmed')
    expect(h.messages[0].body).not.toMatch(/Egypt Tour|0\.00/)
  })
})
