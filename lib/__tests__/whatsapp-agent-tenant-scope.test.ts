import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// The WhatsApp AI agent reads and changes only its own company's trips
// ============================================
// Documents audit, round 13: the "request a quote" tool loaded and updated a
// trip by its id alone, and the trip search and the conversation context read
// the client's trips and quotes without the company — from a webhook that
// may run with a service-role client.

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => ({}) }))

type Row = Record<string, unknown>
let rows: Record<string, Row[]> = {}
let updates: { table: string; values: Row; filters: Record<string, unknown> }[] = []

/** A query builder over `rows` that applies .eq() filters, as PostgREST would. */
function db() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let pending: Row | null = null
      const result = () => (rows[table] ?? []).filter(r => Object.entries(filters).every(([k, v]) => r[k] === v))
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters[c] = v; return q },
        in: () => q,
        gte: () => q,
        order: () => q,
        limit: () => q,
        update: (values: Row) => { pending = values; return q },
        insert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        single: async () => ({ data: result()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (pending) updates.push({ table, values: pending, filters: { ...filters } })
          return resolve({ data: result(), error: null })
        },
      }
      return q
    },
  }
}

import { ToolExecutor, WhatsAppAIAgent } from '@/lib/whatsapp-ai-agent'

beforeEach(() => {
  rows = {
    itineraries: [
      { id: 'own', tenant_id: 't1', client_id: 'c1', itinerary_code: 'IT-1', trip_name: 'Ours', status: 'draft' },
      { id: 'other', tenant_id: 't2', client_id: 'c9', itinerary_code: 'IT-9', trip_name: 'Theirs', status: 'confirmed' },
      { id: 'same-client-other-tenant', tenant_id: 't2', client_id: 'c1', itinerary_code: 'IT-8', trip_name: 'Also theirs', status: 'draft' },
    ],
    clients: [{ id: 'c1', tenant_id: 't2', full_name: 'Someone else’s client' }],
    b2c_quotes: [{ id: 'q9', tenant_id: 't2', client_id: 'c1', quote_number: 'Q-9' }],
    whatsapp_messages: [],
  }
  updates = []
})

const agentTool = (tenantId: string | null = 't1', clientId: string | null = 'c1') =>
  new ToolExecutor(db() as never, clientId, '+81', 'conv-1', tenantId)

describe('request_quote_for_trip', () => {
  it('another company’s trip is not found, and nothing is changed', async () => {
    const r = await agentTool().execute('request_quote_for_trip', { itinerary_id: 'other' })
    expect(r).toMatchObject({ success: false, error: 'Itinerary not found' })
    expect(updates).toEqual([])
  })

  it('a trip of the same client id in another company is not found either', async () => {
    const r = await agentTool().execute('request_quote_for_trip', { itinerary_id: 'same-client-other-tenant' })
    expect(r.success).toBe(false)
    expect(updates).toEqual([])
  })

  it('without a company or a customer, nothing is looked up', async () => {
    expect((await agentTool(null).execute('request_quote_for_trip', { itinerary_id: 'own' })).success).toBe(false)
    expect((await agentTool('t1', null).execute('request_quote_for_trip', { itinerary_id: 'own' })).success).toBe(false)
    expect(updates).toEqual([])
  })

  it('the customer’s own trip in this company is marked pending quote', async () => {
    const r = await agentTool().execute('request_quote_for_trip', { itinerary_id: 'own' })
    expect(r).toMatchObject({ success: true, data: { itinerary_code: 'IT-1' } })
    expect(updates).toEqual([
      expect.objectContaining({ table: 'itineraries', values: expect.objectContaining({ status: 'pending_quote' }), filters: { id: 'own', tenant_id: 't1' } }),
    ])
  })
})

describe('search_customer_trips', () => {
  it('lists only this company’s trips of the customer', async () => {
    const r = await agentTool().execute('search_customer_trips', {})
    const codes = JSON.stringify(r)
    expect(codes).toContain('IT-1')
    expect(codes).not.toContain('IT-8')
    expect(codes).not.toContain('IT-9')
  })
})

describe('the conversation context', () => {
  // The constructor wants a key; gatherContext never calls the model.
  beforeEach(() => { vi.stubEnv('ANTHROPIC_API_KEY', 'test-key') })
  it('reads the client, trips and quotes within the company only', async () => {
    const agent = new WhatsAppAIAgent()
    const ctx = await agent.gatherContext(db() as never, 'conv-1', 'c1', '+81', 't1')
    expect(ctx.clientName).toBeNull()
    expect((ctx.activeItineraries ?? []).map(i => i.id)).toEqual(['own'])
    expect(ctx.activeQuotes ?? []).toEqual([])
  })

  it('with no company, carries no client data at all', async () => {
    const ctx = await new WhatsAppAIAgent().gatherContext(db() as never, 'conv-1', 'c1', '+81', null)
    expect(ctx.activeItineraries).toBeUndefined()
    expect(ctx.clientName).toBeNull()
  })
})
