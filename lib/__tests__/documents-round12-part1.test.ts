import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Documents audit, round 12 — part 1: what crossed tenants or mailboxes
// ============================================

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let rpcCalls: { fn: string; args: Row }[] = []
let role = 'manager'
let updates: { table: string; values: Row; id: unknown }[] = []

/** A tiny in-memory stand-in for the Supabase query builder. */
function db() {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      let pendingUpdate: Row | null = null
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          if (pendingUpdate) updates.push({ table, values: pendingUpdate, id: v })
          rows = rows.filter(r => r[c] === v); return q
        },
        neq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] !== v); return q },
        not: (c: string, _op: string, v: unknown) => { rows = rows.filter(r => r[c] !== v); return q },
        is: () => q,
        order: () => q,
        limit: (n: number) => { rows = rows.slice(0, n); return q },
        update: (values: Row) => { pendingUpdate = values; return q },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } }),
        insert: (values: Row) => ({ select: () => ({ single: async () => ({ data: { id: 'new', ...values }, error: null }) }) }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      }
      return q
    },
    rpc: async (fn: string, args: Row) => { rpcCalls.push({ fn, args }); return { data: 'version-2', error: null } },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, supabase: db(), tenant_id: 't1', user: { id: 'u1' }, role }),
  createAdminClient: () => db(),
  createAuthenticatedClient: async () => db(),
}))

import { POST as revert } from '@/app/api/quotes/[type]/[id]/versions/revert/route'
import { POST as agentsPost, PATCH as agentsPatch, DELETE as agentsDelete } from '@/app/api/whatsapp/agents/route'
import { pickInboundClient } from '@/lib/whatsapp-inbound-client'

const json = (body: unknown) => ({ json: async () => body, url: 'http://x/api' }) as never
const params = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) })

beforeEach(() => {
  tables = {
    b2c_quotes: [{ id: 'q-own', tenant_id: 't1', status: 'sent' }, { id: 'q-other', tenant_id: 't2', status: 'sent' }],
    bookings: [],
    team_members: [{ id: 'm1', tenant_id: 't1', role: 'sales', is_available: true }],
  }
  rpcCalls = []
  updates = []
  role = 'manager'
})

describe('reverting a quote', () => {
  it("another tenant's quote is not found — and nothing is reverted", async () => {
    const res = await revert(json({ version_number: 1 }), params('b2c', 'q-other'))
    expect(res.status).toBe(404)
    expect(rpcCalls).toEqual([])
  })

  it('a booked quote keeps its price', async () => {
    tables.bookings = [{ id: 'b1', booking_number: 'BK-1', quote_id: 'q-own', quote_type: 'b2c', tenant_id: 't1', status: 'active' }]
    const res = await revert(json({ version_number: 1 }), params('b2c', 'q-own'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('BK-1')
    expect(rpcCalls).toEqual([])
  })

  it('a cancelled booking does not hold it; the own quote reverts', async () => {
    tables.bookings = [{ id: 'b1', quote_id: 'q-own', quote_type: 'b2c', tenant_id: 't1', status: 'cancelled' }]
    const res = await revert(json({ version_number: 1 }), params('b2c', 'q-own'))
    expect(res.status).toBe(200)
    expect(rpcCalls).toEqual([expect.objectContaining({ fn: 'revert_b2c_quote_to_version', args: expect.objectContaining({ p_quote_id: 'q-own' }) })])
  })
})

describe('the WhatsApp team', () => {
  it('an agent cannot add or deactivate team members', async () => {
    role = 'agent'
    expect((await agentsPost(json({ name: 'X' }))).status).toBe(403)
    const del = await agentsDelete({ url: 'http://x/api/whatsapp/agents?id=m1' } as never)
    expect(del.status).toBe(403)
    expect(updates).toEqual([])
  })

  it("an agent cannot change a member's role or email, only availability", async () => {
    role = 'agent'
    expect((await agentsPatch(json({ id: 'm1', role: 'admin' }))).status).toBe(403)
    expect((await agentsPatch(json({ id: 'm1', is_available: false }))).status).toBe(200)
    expect(updates.map(u => Object.keys(u.values).sort())).toEqual([['is_available', 'updated_at']])
  })

  it('fields that are not a member’s are never written, even by a manager', async () => {
    await agentsPatch(json({ id: 'm1', name: 'New', tenant_id: 't2', user_id: 'someone' }))
    expect(updates[0].values).not.toHaveProperty('tenant_id')
    expect(updates[0].values).not.toHaveProperty('user_id')
    expect(updates[0].values).toMatchObject({ name: 'New' })
  })
})

describe('an inbound WhatsApp number', () => {
  const c = (id: string, tenant_id: string) => ({ id, full_name: id, tenant_id })
  it('is the client of the one tenant that has it', () => {
    expect(pickInboundClient([c('a', 't1'), c('b', 't1')])?.id).toBe('a')
  })
  it('known to two tenants, is nobody’s to guess', () => {
    expect(pickInboundClient([c('a', 't1'), c('b', 't2')])).toBeNull()
    expect(pickInboundClient([])).toBeNull()
  })
  it('the webhook looks for the client inside the conversation’s tenant', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/api/whatsapp/webhook/route.ts'), 'utf8')
    const convAt = src.indexOf(".from('whatsapp_conversations')")
    const clientAt = src.indexOf("clientQuery = clientQuery.eq('tenant_id', existingConversation.tenant_id)")
    expect(convAt).toBeGreaterThan(-1)
    expect(clientAt).toBeGreaterThan(convAt)
  })
})

describe('source guards', () => {
  const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

  it('no Gmail route keeps one OAuth client for every request', () => {
    for (const f of ['actions', 'labels', 'send']) {
      const r = src(`app/api/gmail/${f}/route.ts`)
      expect(r, f).not.toContain('_oauth2Client')
      expect(r, f).toContain('getGmailClient(access_token, refresh_token)')
    }
  })

  it('a reply in a conversation goes into its real Gmail thread, and stores Gmail’s thread id', () => {
    const r = src('app/api/gmail/send/route.ts')
    expect(r).toContain(".eq('unified_conversation_id', conversationId)")
    expect(r).toContain('threadId: gmailThreadId ?? undefined')
    expect(r).toContain('gmail_thread_id: response.data.threadId ?? gmailThreadId')
  })

  it('a WhatsApp conversation takes only known actions', () => {
    const r = src('app/api/whatsapp/conversations/route.ts')
    expect(r).not.toContain('...updates')
    expect(r).toContain("{ error: 'Unknown action' }")
  })

  it('a quote made from a trip checks its client is the tenant’s', () => {
    expect(src('app/api/quotes/b2c/from-itinerary/route.ts')).toContain('recordsInTenant(supabase, authResult.tenant_id, { client_id })')
  })
})
