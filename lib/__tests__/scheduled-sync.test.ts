import { describe, it, expect } from 'vitest'
import { mailboxesToSync, planMailboxSweep, tenantForUser, lookBackDays } from '@/lib/email/scheduled-sync'

// ============================================
// Which mailboxes the scheduled sweep pulls
// ============================================
// Every mailbox that is actually connected — not only the ones whose owner
// happens to be logged in — because the whole point is that a customer who
// writes on Friday evening is seen before Monday.

const box = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1',
  tenant_id: 't1',
  email: 'ops@agency.test',
  access_token: 'a',
  refresh_token: 'r',
  ...over,
})

describe('mailboxesToSync', () => {
  it('takes every connected mailbox, whoever is logged in', () => {
    const rows = [box(), box({ user_id: 'u2', tenant_id: 't2' })]
    expect(mailboxesToSync(rows).map(m => m.user_id)).toEqual(['u1', 'u2'])
  })

  it('skips a half-finished connection rather than failing on it every ten minutes', () => {
    expect(mailboxesToSync([box({ refresh_token: null })])).toEqual([])
    expect(mailboxesToSync([box({ access_token: null })])).toEqual([])
  })

  it('skips a mailbox with no company — there is nowhere to write its mail', () => {
    expect(mailboxesToSync([box({ tenant_id: null })])).toEqual([])
    expect(mailboxesToSync([box({ user_id: null })])).toEqual([])
  })

  it('syncs a user once even with duplicate rows', () => {
    expect(mailboxesToSync([box(), box()])).toHaveLength(1)
  })

  it('takes the company the mailbox row states, when it states one', () => {
    const elsewhere = [{ user_id: 'u1', tenant_id: 'tenant-other', joined_at: '2020-01-01' }]
    expect(mailboxesToSync([box({ tenant_id: 'tenant-9' })], elsewhere)[0].tenant_id).toBe('tenant-9')
  })

  it('is empty for no rows', () => {
    expect(mailboxesToSync([])).toEqual([])
  })
})

// ============================================
// The mailbox row never said which company
// ============================================
// Checked on production, 2026-09-20: the Google sign-in that creates the row
// never wrote tenant_id, so ALL FOUR connected mailboxes had it NULL. The
// sweep skipped a mailbox with no company — so it would have run every ten
// minutes, synced nothing, and reported success. Nothing had been stored
// since 6 September.

describe('a mailbox whose row names no company', () => {
  const live = [
    box({ user_id: 'afford', tenant_id: null, email: 'hello@affordegypt.com' }),
    box({ user_id: 'sawa', tenant_id: null, email: 'hello@sawa.tours' }),
  ]
  const members = [
    { user_id: 'afford', tenant_id: 't-afford', joined_at: '2026-07-01T00:00:00Z' },
    { user_id: 'sawa', tenant_id: 't-sawa', joined_at: '2026-09-01T00:00:00Z' },
  ]

  it('is filed under its owner\'s company — the production case', () => {
    const { mailboxes, skipped } = planMailboxSweep(live, members)
    expect(mailboxes.map(m => [m.email, m.tenant_id])).toEqual([
      ['hello@affordegypt.com', 't-afford'],
      ['hello@sawa.tours', 't-sawa'],
    ])
    expect(skipped).toEqual([])
  })

  it('without the memberships, is exactly the silent nothing it used to be — now reported', () => {
    const { mailboxes, skipped } = planMailboxSweep(live, [])
    expect(mailboxes).toEqual([])
    expect(skipped.map(s => s.email)).toEqual(['hello@affordegypt.com', 'hello@sawa.tours'])
    expect(skipped[0].reason).toMatch(/belongs to no company/)
  })

  it('an owner in two companies is filed under the first joined — the app-wide rule (#428)', () => {
    const two = [
      { user_id: 'u1', tenant_id: 't-later', joined_at: '2026-05-01T00:00:00Z' },
      { user_id: 'u1', tenant_id: 't-first', joined_at: '2026-01-01T00:00:00Z' },
    ]
    expect(tenantForUser('u1', null, two)).toBe('t-first')
    // Joined at the same instant: the lower id, so the answer never flips.
    const tie = [{ user_id: 'u1', tenant_id: 't-b', joined_at: '2026-01-01' }, { user_id: 'u1', tenant_id: 't-a', joined_at: '2026-01-01' }]
    expect(tenantForUser('u1', null, tie)).toBe('t-a')
  })

  it('never borrows somebody else\'s company', () => {
    expect(tenantForUser('u1', null, [{ user_id: 'someone-else', tenant_id: 't-x', joined_at: '2026-01-01' }])).toBeNull()
  })

  it('says why a half-finished sign-in was skipped', () => {
    const { skipped } = planMailboxSweep([box({ refresh_token: null })], [])
    expect(skipped[0].reason).toMatch(/never finished/)
  })
})

describe('how far back a run looks', () => {
  const now = new Date('2026-09-20T12:00:00Z')

  it('three days, ordinarily', () => {
    expect(lookBackDays('2026-09-20T11:50:00Z', now)).toBe(3)
  })

  it('reaches back across a gap — the sweep was off from 6 to 20 September', () => {
    // A fixed 3 days would have skipped eleven days of customers for good.
    expect(lookBackDays('2026-09-06T13:29:43Z', now)).toBe(15)
  })

  it('a month at most in one run, and a month for a company with no mail yet', () => {
    expect(lookBackDays('2026-01-01T00:00:00Z', now)).toBe(30)
    expect(lookBackDays(null, now)).toBe(30)
    expect(lookBackDays('not a date', now)).toBe(30)
  })
})
