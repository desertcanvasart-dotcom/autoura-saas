import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// GET/POST /api/share/[token]/messages — the trip thread, traveller side.
//
// Public input path, like the report route: no session, the share token is
// the credential, the body is attacker-controllable. Contract under test:
//   * malformed / unknown / revoked tokens are a uniform 404
//   * an inbound row's identity (tenant, itinerary, direction) is derived
//     server-side — a poisoned body cannot override any of it, and the
//     traveller can never write direction='outbound'
//   * GET crosses the boundary only through toClientTripMessages — internal
//     columns are not even selected, and the projection drops junk rows
//   * the per-trip hourly cap works and refuses without inserting
// ============================================================================

const pushes: unknown[] = []
const inserted: { table: string; row: Record<string, unknown> }[] = []

let shareRow: Record<string, unknown> | null = null
let itineraryRow: Record<string, unknown> | null = null
let messageRows: Array<Record<string, unknown>> = []
let recentInboundCount = 0
let prevConversationId: string | null = null
let existingConversationId: string | null = null
// when non-empty, email lookups consume this queue (for race sequencing)
let emailLookupQueue: Array<string | null> = []
let conversationInsertResult: { data: { id: string } | null; error: { code: string; message: string } | null } =
  { data: { id: 'conv-new' }, error: null }

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'itinerary_shares') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: shareRow }) }) }) }
      }
      if (table === 'itineraries') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: itineraryRow }) }) }) }
      }
      if (table === 'unified_conversations') {
        return {
          // email lookup: .select('id').eq().eq().order().limit().maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      const id = emailLookupQueue.length > 0 ? emailLookupQueue.shift()! : existingConversationId
                      return { data: id ? { id } : null }
                    },
                  }),
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, row })
            return { select: () => ({ single: async () => ({ data: conversationInsertResult.data, error: conversationInsertResult.error }) }) }
          },
        }
      }
      if (table === 'trip_messages') {
        return {
          select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              // the hourly-cap count: .eq().eq().gte()
              return { eq: () => ({ eq: () => ({ gte: async () => ({ count: recentInboundCount }) }) }) }
            }
            return {
              eq: () => ({
                order: () => ({ limit: async () => ({ data: messageRows }) }),
                not: () => ({
                  order: () => ({
                    limit: () => ({ maybeSingle: async () => ({ data: prevConversationId ? { unified_conversation_id: prevConversationId } : null }) }),
                  }),
                }),
              }),
            }
          },
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, row })
            return {
              select: () => ({
                single: async () => ({
                  data: { direction: row.direction, content: row.content, sender_name: row.sender_name, created_at: '2026-08-24T18:00:00Z' },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))
vi.mock('@/lib/push', () => ({
  sendPushToTenant: async (tenantId: string, payload: unknown) => { pushes.push({ tenantId, payload }) },
}))

import { GET, POST } from '@/app/api/share/[token]/messages/route'

let seq = 0
function makeReq(method: string, body?: unknown, token?: string) {
  seq++
  const t = token ?? `M${seq}`.padEnd(32, 'x')
  const req = new Request(`https://app.test/api/share/${t}/messages`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.1.0.${seq}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { req: req as never, params: { params: Promise.resolve({ token: t }) } }
}

beforeEach(() => {
  pushes.length = 0
  inserted.length = 0
  shareRow = { itinerary_id: 'itin-1', tenant_id: 'tenant-1', revoked_at: null }
  itineraryRow = { trip_name: 'Cairo & Nile', client_id: 'client-1', client_name: 'Maria', client_email: 'maria@example.com' }
  messageRows = []
  recentInboundCount = 0
  prevConversationId = null
  existingConversationId = null
  emailLookupQueue = []
  conversationInsertResult = { data: { id: 'conv-new' }, error: null }
})

describe('token gate (both methods)', () => {
  it('404s malformed, unknown and revoked tokens', async () => {
    const bad = makeReq('GET', undefined, 'nope')
    expect((await GET(bad.req, bad.params)).status).toBe(404)

    shareRow = null
    const gone = makeReq('POST', { message: 'hi' })
    expect((await POST(gone.req, gone.params)).status).toBe(404)

    shareRow = { itinerary_id: 'itin-1', tenant_id: 'tenant-1', revoked_at: '2026-08-01T00:00:00Z' }
    const revoked = makeReq('POST', { message: 'hi' })
    expect((await POST(revoked.req, revoked.params)).status).toBe(404)
    expect(inserted).toHaveLength(0)
  })
})

describe('GET — the allowlist boundary', () => {
  it('returns only direction/content/senderName/createdAt, drops junk rows', async () => {
    messageRows = [
      { direction: 'outbound', content: 'On our way!', sender_name: 'Adham', created_at: '2026-08-24T10:00:00Z',
        team_member_id: 'TM-SECRET', unified_conversation_id: 'CONV-SECRET', tenant_id: 'TENANT-SECRET', is_read: false },
      { direction: 'sideways', content: 'bogus direction', created_at: '2026-08-24T11:00:00Z' },
      { direction: 'inbound', content: '', created_at: '2026-08-24T12:00:00Z' },
    ]
    const { req, params } = makeReq('GET')
    const res = await GET(req, params)
    const data = await res.json()
    expect(data.messages).toHaveLength(1)
    const json = JSON.stringify(data)
    for (const secret of ['TM-SECRET', 'CONV-SECRET', 'TENANT-SECRET', 'is_read', 'bogus direction']) {
      expect(json, `leaked: ${secret}`).not.toContain(secret)
    }
  })
})

describe('POST — identity is derived, direction is pinned', () => {
  it('writes an inbound row for the share tenant/itinerary whatever the body claims', async () => {
    const { req, params } = makeReq('POST', {
      message: 'Where is the driver?',
      direction: 'outbound', tenant_id: 'EVIL', itinerary_id: 'EVIL', sender_name: 'The Office',
      team_member_id: 'EVIL-TM', is_read: true,
    })
    const res = await POST(req, params)
    expect(res.status).toBe(200)
    const msg = inserted.find(i => i.table === 'trip_messages')!.row
    expect(msg.direction).toBe('inbound')
    expect(msg.tenant_id).toBe('tenant-1')
    expect(msg.itinerary_id).toBe('itin-1')
    expect(msg.team_member_id).toBeUndefined()
    expect(msg.sender_name).toBe('Maria') // client name, not the body's claim
  })

  it('400s an empty message without inserting', async () => {
    const { req, params } = makeReq('POST', { message: '  \n ' })
    expect((await POST(req, params)).status).toBe(400)
    expect(inserted).toHaveLength(0)
  })

  it('reuses the thread conversation, then the client-email conversation, then creates one', async () => {
    prevConversationId = 'conv-prev'
    let r = makeReq('POST', { message: 'first' })
    await POST(r.req, r.params)
    expect(inserted.find(i => i.table === 'trip_messages')!.row.unified_conversation_id).toBe('conv-prev')

    inserted.length = 0
    prevConversationId = null
    existingConversationId = 'conv-email'
    r = makeReq('POST', { message: 'second' })
    await POST(r.req, r.params)
    expect(inserted.find(i => i.table === 'trip_messages')!.row.unified_conversation_id).toBe('conv-email')

    inserted.length = 0
    existingConversationId = null
    r = makeReq('POST', { message: 'third' })
    await POST(r.req, r.params)
    expect(inserted.find(i => i.table === 'unified_conversations')!.row.tenant_id).toBe('tenant-1')
    expect(inserted.find(i => i.table === 'trip_messages')!.row.unified_conversation_id).toBe('conv-new')
  })

  it('pushes to the tenant after a send', async () => {
    const { req, params } = makeReq('POST', { message: 'ping' })
    await POST(req, params)
    expect(pushes).toHaveLength(1)
    expect((pushes[0] as { tenantId: string }).tenantId).toBe('tenant-1')
  })

  it('429s at the hourly per-trip cap without inserting', async () => {
    recentInboundCount = 60
    const { req, params } = makeReq('POST', { message: 'spam' })
    expect((await POST(req, params)).status).toBe(429)
    expect(inserted).toHaveLength(0)
  })

  it('allows normal chat cadence (6 quick lines) but 429s a hammering token', async () => {
    const token = 'H'.repeat(32)
    const statuses: number[] = []
    for (let i = 0; i < 21; i++) {
      const { req, params } = makeReq('POST', { message: 'spam' }, token)
      statuses.push((await POST(req, params)).status)
    }
    // the 'chat' limit (20/min) must not trip on a real conversation burst...
    expect(statuses.slice(0, 6).every(s => s === 200)).toBe(true)
    // ...but the 21st message in a minute is not a conversation
    expect(statuses[20]).toBe(429)
  })

  it('recovers the conversation when the unique-email insert race is lost', async () => {
    prevConversationId = null
    // first lookup misses (race window), insert loses on 23505, retry finds the winner
    emailLookupQueue = [null, 'conv-winner']
    conversationInsertResult = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const { req, params } = makeReq('POST', { message: 'raced' })
    const res = await POST(req, params)
    expect(res.status).toBe(200)
    expect(inserted.find(i => i.table === 'trip_messages')!.row.unified_conversation_id).toBe('conv-winner')
  })
})
