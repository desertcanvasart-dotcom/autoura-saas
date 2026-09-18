import { describe, it, expect } from 'vitest'
import { mailboxesToSync } from '@/lib/email/scheduled-sync'

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

  it('carries the tenant from the mailbox row, never from anywhere else', () => {
    expect(mailboxesToSync([box({ tenant_id: 'tenant-9' })])[0].tenant_id).toBe('tenant-9')
  })

  it('is empty for no rows', () => {
    expect(mailboxesToSync([])).toEqual([])
  })
})
