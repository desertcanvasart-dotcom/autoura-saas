import { describe, it, expect, beforeEach } from 'vitest'
import { promoteBriefToThread } from '../concierge/promote-brief-to-thread'
import { commitBriefToItinerary } from '../concierge/commit-brief-to-itinerary'

// ============================================================================
// Concierge chain wiring — idempotency of the connectors that thread
// concierge_briefs -> communication_threads -> itineraries.
//
// The repo's _mock-supabase is read-only (built for the pricing engine), so we
// use a tiny write-capable in-memory fake here. It enforces NO unique indexes —
// which is deliberate: it proves the CODE-layer idempotency (find-before-insert)
// holds on its own, independent of the DB partial-unique guards.
// ============================================================================

type Row = Record<string, any>

function makeFakeSupabase(seed: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = {
    concierge_briefs: [],
    communication_threads: [],
    communication_inbox: [],
    itineraries: [],
    ...seed,
  }
  let idSeq = 0
  const nextId = (t: string) => `${t}-${++idSeq}`

  class Query {
    table: string
    filters: [string, any][] = []
    op: 'select' | 'insert' | 'update' = 'select'
    payload: Row | null = null
    wantCount = false
    constructor(table: string) {
      this.table = table
    }
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count) this.wantCount = true
      return this
    }
    insert(row: Row) {
      this.op = 'insert'
      this.payload = row
      return this
    }
    update(row: Row) {
      this.op = 'update'
      this.payload = row
      return this
    }
    eq(col: string, val: any) {
      this.filters.push([col, val])
      return this
    }
    private match(): Row[] {
      return store[this.table].filter((r) =>
        this.filters.every(([c, v]) => String(r[c]) === String(v))
      )
    }
    private run(): { data: any; error: any; count?: number } {
      if (this.op === 'insert') {
        const row = { id: nextId(this.table), ...this.payload }
        store[this.table].push(row)
        return { data: row, error: null }
      }
      if (this.op === 'update') {
        for (const r of this.match()) Object.assign(r, this.payload)
        return { data: null, error: null }
      }
      const matched = this.match()
      if (this.wantCount) return { data: null, error: null, count: matched.length }
      return { data: matched, error: null }
    }
    single() {
      const res = this.run()
      const row = Array.isArray(res.data) ? res.data[0] : res.data
      return Promise.resolve(
        row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      )
    }
    maybeSingle() {
      const res = this.run()
      const row = Array.isArray(res.data) ? res.data[0] ?? null : res.data
      return Promise.resolve({ data: row, error: null })
    }
    then(resolve: (v: any) => void) {
      resolve(this.run())
    }
  }

  return {
    store,
    from(table: string) {
      return new Query(table)
    },
  }
}

const BRIEF: Row = {
  id: 'brief-1',
  tenant_id: 'tenant-1',
  client_id: 'client-1',
  conversation_id: 'conv-1',
  brief_revision: 1,
  visitor_name: 'Aya Tanaka',
  visitor_email: 'aya@example.com',
  visitor_phone: '+201234567',
  preferred_contact: 'email',
  brief_summary: 'Family trip to Cairo & Luxor, 7 nights, deluxe.',
  destinations: ['Cairo', 'Luxor'],
  trip_length_days: 7,
  dates_specific: '2026-11-01',
  travelers_count: 3,
  submitted_at: '2026-06-30T10:00:00Z',
  received_at: '2026-06-30T10:00:00Z',
  language: 'en',
  dates_window: null,
}

describe('promoteBriefToThread — idempotency', () => {
  let sb: ReturnType<typeof makeFakeSupabase>
  beforeEach(() => {
    sb = makeFakeSupabase({ concierge_briefs: [{ ...BRIEF }] })
  })

  it('creates exactly one thread + one inbox row, and no-ops on replay', async () => {
    const first = await promoteBriefToThread('brief-1', 'tenant-1', sb as any)
    const second = await promoteBriefToThread('brief-1', 'tenant-1', sb as any)

    expect(first.wasNewThread).toBe(true)
    expect(second.wasNewThread).toBe(false)
    expect(first.threadId).toBe(second.threadId)

    expect(sb.store.communication_threads).toHaveLength(1)
    expect(sb.store.communication_inbox).toHaveLength(1)

    const thread = sb.store.communication_threads[0]
    expect(thread.brief_id).toBe('brief-1')
    expect(thread.origin).toBe('concierge')
    expect(thread.tenant_id).toBe('tenant-1')
    expect(thread.channel).toBe('email') // preferred_contact = 'email'
  })

  it('encodes the revision in the inbox source id (new revision → new inbox row, same thread)', async () => {
    await promoteBriefToThread('brief-1', 'tenant-1', sb as any)
    // Simulate an updated brief (revision 2).
    sb.store.concierge_briefs[0].brief_revision = 2
    await promoteBriefToThread('brief-1', 'tenant-1', sb as any)

    expect(sb.store.communication_threads).toHaveLength(1)
    expect(sb.store.communication_inbox).toHaveLength(2)
    expect(sb.store.communication_inbox.map((r) => r.source_message_id)).toEqual([
      'concierge:brief-1:rev1',
      'concierge:brief-1:rev2',
    ])
  })
})

describe('commitBriefToItinerary — idempotency + provenance', () => {
  let sb: ReturnType<typeof makeFakeSupabase>
  beforeEach(async () => {
    sb = makeFakeSupabase({ concierge_briefs: [{ ...BRIEF }] })
    await promoteBriefToThread('brief-1', 'tenant-1', sb as any)
  })

  it('creates exactly one itinerary per thread and returns the same one on replay', async () => {
    const threadId = sb.store.communication_threads[0].id
    const first = await commitBriefToItinerary(threadId, 'tenant-1', sb as any)
    const second = await commitBriefToItinerary(threadId, 'tenant-1', sb as any)

    expect(first.wasNewItinerary).toBe(true)
    expect(second.wasNewItinerary).toBe(false)
    expect(first.itineraryId).toBe(second.itineraryId)
    expect(sb.store.itineraries).toHaveLength(1)

    const itin = sb.store.itineraries[0]
    expect(itin.thread_id).toBe(threadId)
    expect(itin.tenant_id).toBe('tenant-1')
    expect(itin.client_id).toBe('client-1')
    expect(itin.start_date).toBe('2026-11-01')
    expect(itin.total_days).toBe(7)
    expect(itin.num_adults).toBe(3)
    expect(itin.status).toBe('draft')
    // Provenance: itinerary -> thread -> brief
    const thread = sb.store.communication_threads.find((t) => t.id === itin.thread_id)
    expect(thread?.brief_id).toBe('brief-1')
  })

  it('refuses a non-concierge thread', async () => {
    sb.store.communication_threads[0].origin = 'whatsapp'
    const threadId = sb.store.communication_threads[0].id
    await expect(commitBriefToItinerary(threadId, 'tenant-1', sb as any)).rejects.toThrow(/origin/)
  })
})
