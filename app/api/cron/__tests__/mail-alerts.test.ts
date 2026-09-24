import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// New mail announced while Autoura is closed (operator, 2026-09-24): the
// server checks every connected Gmail and rings its owner.
let boxes: Array<Record<string, unknown>> = []
const notifyNewEmails = vi.fn<(gmail: unknown, userId: string) => Promise<void>>(async () => {})

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: async () => ({ data: boxes, error: null }) }),
  }),
}))
vi.mock('@/lib/support/job-runs', () => ({ withJobRun: (_n: string, _db: unknown, h: unknown) => h }))
vi.mock('@/lib/email/new-mail-alerts', () => ({ notifyNewEmails: (...a: [unknown, string]) => notifyNewEmails(...a) }))
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    gmail: () => ({}),
  },
}))

process.env.CRON_SECRET = 'test-secret'
const { GET } = await import('@/app/api/cron/mail-alerts/route')
const call = (auth?: string) =>
  GET(new NextRequest('http://x/api/cron/mail-alerts', auth ? { headers: { authorization: auth } } : undefined))

beforeEach(() => { boxes = []; notifyNewEmails.mockReset() })

describe('GET /api/cron/mail-alerts', () => {
  it('refuses without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(notifyNewEmails).not.toHaveBeenCalled()
  })

  it('checks every mailbox for its owner, and one failure does not stop the rest', async () => {
    boxes = [
      { user_id: 'u1', email: 'a@x.com', access_token: 'a', refresh_token: 'r' },
      { user_id: 'u2', email: 'b@x.com', access_token: 'a', refresh_token: 'r' },
      { user_id: 'u3', email: 'c@x.com', access_token: 'a', refresh_token: null },
    ]
    notifyNewEmails.mockImplementationOnce(async () => { throw new Error('invalid_grant') })
    const res = await call('Bearer test-secret')
    const body = await res.json()
    expect(notifyNewEmails.mock.calls.map(c => c[1])).toEqual(['u1', 'u2'])
    expect(body).toMatchObject({ success: false, mailboxes: 3, checked: 1, failed: 2 })
    expect(body.results[2].error).toMatch(/reconnect Gmail/)
  })
})
