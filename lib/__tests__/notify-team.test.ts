import { describe, it, expect, vi, beforeEach } from 'vitest'

// A fake admin client: tenant_members answers `members`; notifications
// records what was upserted / updated.
let members: Array<{ user_id: string | null }> = []
let upserts: Array<{ rows: Record<string, unknown>[]; opts: unknown }> = []
let updates: Array<{ set: unknown; filters: Array<[string, unknown]> }> = []

function fakeAdmin() {
  return {
    from(table: string) {
      if (table === 'tenant_members') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          then: (ok: (v: unknown) => unknown) => ok({ data: members, error: null }),
        }
        return chain
      }
      return {
        upsert: async (rows: Record<string, unknown>[], opts: unknown) => {
          upserts.push({ rows, opts })
          return { error: null }
        },
        update: (set: unknown) => {
          const rec = { set, filters: [] as Array<[string, unknown]> }
          updates.push(rec)
          const chain = {
            eq: (col: string, v: unknown) => { rec.filters.push([col, v]); return chain },
            then: (ok: (v: unknown) => unknown) => ok({ error: null }),
          }
          return chain
        },
      }
    },
  }
}

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/email', () => ({ sendSystemEmail: vi.fn() }))

import { notifyTeam, markTeamNotificationsRead, bellSnippet } from '@/lib/notifications'

beforeEach(() => { members = []; upserts = []; updates = [] })

describe('notifyTeam — new WhatsApp messages and concierge leads go to everyone', () => {
  const base = {
    tenant_id: 't1', dedupe_key: 'wa:c1', type: 'whatsapp_new_message',
    title: 'New WhatsApp message from Ahmed', message: 'Hello', link: '/whatsapp-inbox',
  }

  it('one unread item per active login, keyed to the thing', async () => {
    members = [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }, { user_id: null }]
    await notifyTeam(base)
    expect(upserts).toHaveLength(1)
    const rows = upserts[0].rows
    expect(rows.map(r => r.user_id)).toEqual(['u1', 'u2']) // de-duplicated, no nulls
    expect(rows.every(r => r.dedupe_key === 'wa:c1' && r.is_read === false)).toBe(true)
    // A repeat UPDATES the same item (latest text, unread, back on top) — not a second item.
    expect(upserts[0].opts).toEqual({ onConflict: 'user_id,dedupe_key' })
    expect(typeof rows[0].created_at).toBe('string')
  })

  it('a team with no logins writes nothing', async () => {
    await notifyTeam(base)
    expect(upserts).toHaveLength(0)
  })

  it('read by one = read for all: clears by key, for everyone', async () => {
    await markTeamNotificationsRead('concierge:b1')
    expect(updates).toEqual([
      { set: { is_read: true }, filters: [['dedupe_key', 'concierge:b1'], ['is_read', false]] },
    ])
  })
})

describe('bellSnippet', () => {
  it('collapses whitespace and trims long text', () => {
    expect(bellSnippet('  hi\n\nthere ')).toBe('hi there')
    expect(bellSnippet('x'.repeat(200))).toHaveLength(140)
    expect(bellSnippet(null)).toBe('')
  })
})
