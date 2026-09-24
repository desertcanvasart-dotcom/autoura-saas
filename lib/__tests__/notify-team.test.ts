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
        upsert: (rows: Record<string, unknown>[] | Record<string, unknown>, opts: unknown) => {
          upserts.push({ rows: Array.isArray(rows) ? rows : [rows], opts })
          const done = { error: null }
          return {
            then: (ok: (v: unknown) => unknown) => ok(done),
            select: async () => ({ data: filedBack, error: null }),
          }
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
const push = vi.fn(async () => ({ outcome: 'sent', delivered: 1 }))
vi.mock('@/lib/push', () => ({ sendPushToUsers: (...a: unknown[]) => push(...(a as [])) }))

import { notifyTeam, notifyUserOnce, markTeamNotificationsRead, bellSnippet } from '@/lib/notifications'

// notifyUserOnce reads back what the upsert filed: [] when the key existed.
let filedBack: Array<{ id: string }> = []

beforeEach(() => { members = []; upserts = []; updates = []; filedBack = []; push.mockClear() })

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

describe('the alert on phones and computers (push)', () => {
  it('a team event rings every login on the team, tagged so one chat = one alert', async () => {
    members = [{ user_id: 'u1' }, { user_id: 'u2' }]
    await notifyTeam({ tenant_id: 't1', dedupe_key: 'wa:c1', type: 'whatsapp_new_message', title: 'New WhatsApp message from Ahmed', message: 'Hello', link: '/whatsapp-inbox' })
    expect(push).toHaveBeenCalledWith(['u1', 'u2'], { title: 'New WhatsApp message from Ahmed', body: 'Hello', url: '/whatsapp-inbox', tag: 'wa:c1' })
  })

  it('a new email rings its owner once — the second check that sees it stays quiet', async () => {
    const email = { user_id: 'u1', dedupe_key: 'gmail:m1', type: 'new_email', title: 'New email from Jane', message: 'Booking', link: '/inbox' }
    filedBack = [{ id: 'n1' }]
    expect(await notifyUserOnce(email)).toBe(true)
    filedBack = [] // already filed: the upsert ignored it
    expect(await notifyUserOnce(email)).toBe(false)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(['u1'], expect.objectContaining({ tag: 'gmail:m1', url: '/inbox' }))
  })
})
