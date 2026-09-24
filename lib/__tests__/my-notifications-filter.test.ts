import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendSystemEmail: vi.fn() }))

import { myNotificationsFilter } from '@/lib/notifications'

// A team_members lookup that finds `row` (or nothing).
function directory(row: { id: string } | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return { from: () => chain } as never
}

describe('myNotificationsFilter — what the bell shows you', () => {
  it('a login with no staff record still gets what is addressed to it', async () => {
    // Live on 2026-09-24: none of the five Gmail-connected logins had one,
    // so the bell could never show them anything.
    const f = await myNotificationsFilter(directory(null), 't1', { id: 'u1', email: 'hello@x.com' })
    expect(f).toBe('user_id.eq.u1')
  })

  it('a login with a staff record gets both', async () => {
    const f = await myNotificationsFilter(directory({ id: 'tm9' }), 't1', { id: 'u1', email: 'a@x.com' })
    expect(f).toBe('user_id.eq.u1,team_member_id.eq.tm9')
  })
})
