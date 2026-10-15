import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeDb } from '@/lib/__tests__/_fake-db'
import { scheduleTimeProblem, outcomeOfError, MAX_ATTEMPTS } from '@/lib/email/scheduled-send'

// ============================================
// Schedule send — the rules, the Scheduled list and the job
// ============================================

let db = fakeDb({})
const draftSends: string[] = []
let sendBehaviour: (id: string) => Promise<unknown> = async id => ({ data: { id: `sent-${id}` } })
let draftHeaders: Array<{ name: string; value: string }> = []

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, user: { id: 'u1' }, tenant_id: 'ten1', role: 'member', supabase: {} }),
  createAdminClient: () => db,
}))
vi.mock('@/lib/gmail', async () => {
  const real = await vi.importActual<typeof import('@/lib/gmail')>('@/lib/gmail')
  return {
    ...real,
    refreshAccessToken: async () => ({ access_token: 'fresh' }),
    getGmailClient: () => ({
      users: {
        drafts: {
          send: async ({ requestBody }: { requestBody: { id: string } }) => { draftSends.push(requestBody.id); return sendBehaviour(requestBody.id) },
          get: async () => ({ data: { message: { threadId: 't9', payload: { headers: draftHeaders } } } }),
        },
      },
    }),
  }
})
vi.mock('@/lib/support/job-runs', () => ({ withJobRun: (_n: string, _d: unknown, h: unknown) => h }))

process.env.CRON_SECRET = 'sec'
const { GET: RUN } = await import('@/app/api/cron/scheduled-send/route')
const { GET: LIST, POST: SCHEDULE, DELETE: CANCEL } = await import('@/app/api/gmail/scheduled/route')

const cron = () => RUN(Object.assign(new Request('http://x', { headers: { authorization: 'Bearer sec' } })) as never)
const json = (b: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never
const withQs = (qs: string, method = 'GET') => { const u = new URL(`http://x/a?${qs}`); return Object.assign(new Request(u, { method }), { nextUrl: u }) as never }

const past = new Date(Date.now() - 60_000).toISOString()
const future = new Date(Date.now() + 3_600_000).toISOString()
const tokens = { user_id: 'u1', tenant_id: 'ten1', access_token: 'a', refresh_token: 'r', token_expiry: '2999-01-01', email: 'me@x.com' }
const sched = (over: Record<string, unknown>) => ({ id: 's1', tenant_id: 'ten1', user_id: 'u1', gmail_draft_id: 'dr-1', send_at: past, status: 'pending', attempts: 0, ...over })

beforeEach(() => {
  draftSends.length = 0
  sendBehaviour = async id => ({ data: { id: `sent-${id}` } })
  draftHeaders = [{ name: 'To', value: 'Ann <ann@client.com>' }, { name: 'Subject', value: 'Your quote' }]
})

describe('rules', () => {
  const now = new Date('2026-10-15T10:00:00Z')
  it('takes a time between a minute and a year out', () => {
    expect(scheduleTimeProblem('2026-10-15T10:30:00Z', now)).toBeNull()
    expect(scheduleTimeProblem('2026-10-15T10:00:20Z', now)).toMatch(/minute/)
    expect(scheduleTimeProblem('2028-01-01T00:00:00Z', now)).toMatch(/year/)
    expect(scheduleTimeProblem('nonsense', now)).toMatch(/Choose/)
  })
  it('retries passing Gmail errors, not a missing draft, and not forever', () => {
    expect(outcomeOfError({ code: 503, message: 'busy' }, 1).status).toBe('pending')
    expect(outcomeOfError({ code: 429 }, 1).status).toBe('pending')
    expect(outcomeOfError({ code: 503 }, MAX_ATTEMPTS).status).toBe('failed')
    expect(outcomeOfError({ code: 404 }, 1)).toMatchObject({ status: 'failed', error: expect.stringMatching(/deleted or already sent/) })
    expect(outcomeOfError({ code: 400, message: 'Invalid To header' }, 1).status).toBe('failed')
  })
})

describe('the job', () => {
  it('refuses without the secret', async () => {
    expect((await RUN(new Request('http://x') as never)).status).toBe(401)
  })

  it('sends what is due — and only that', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({}), sched({ id: 's2', gmail_draft_id: 'dr-2', send_at: future })] })
    const body = await (await cron()).json()
    expect(draftSends).toEqual(['dr-1'])
    expect(body).toMatchObject({ due: 1, sent: 1, failed: 0 })
    expect(db.tables.scheduled_emails[0]).toMatchObject({ status: 'sent', gmail_message_id: 'sent-dr-1' })
    expect(db.tables.scheduled_emails[1].status).toBe('pending')
  })

  it('never sends a cancelled one', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({ status: 'cancelled' })] })
    await cron()
    expect(draftSends).toEqual([])
  })

  it('two overlapping runs send it once', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({})] })
    await Promise.all([cron(), cron()])
    expect(draftSends).toEqual(['dr-1'])
  })

  it('a deleted draft fails with a reason', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({})] })
    sendBehaviour = async () => { throw Object.assign(new Error('nf'), { code: 404 }) }
    const body = await (await cron()).json()
    expect(body.failed).toBe(1)
    expect(db.tables.scheduled_emails[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/deleted or already sent/) })
  })

  it('a passing Gmail error is retried next run', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({})] })
    sendBehaviour = async () => { throw Object.assign(new Error('backend'), { code: 503 }) }
    await cron()
    expect(db.tables.scheduled_emails[0]).toMatchObject({ status: 'pending', attempts: 1 })
  })

  it('a send interrupted mid-way is reported, never repeated', async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString()
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({ status: 'sending', claimed_at: old })] })
    const body = await (await cron()).json()
    expect(draftSends).toEqual([])
    expect(body.interrupted).toBe(1)
    expect(db.tables.scheduled_emails[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/Check Sent/) })
  })

  it('a disconnected mailbox fails with what to do', async () => {
    db = fakeDb({ gmail_tokens: [], scheduled_emails: [sched({})] })
    await cron()
    expect(db.tables.scheduled_emails[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/reconnect/) })
  })
})

describe('the Scheduled list', () => {
  it('schedules a saved draft, with who it goes to and its subject', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [] })
    const res = await SCHEDULE(json({ userId: 'u1', draftId: 'dr-5', sendAt: future }))
    expect(res.status).toBe(200)
    expect(db.tables.scheduled_emails[0]).toMatchObject({
      tenant_id: 'ten1', user_id: 'u1', gmail_draft_id: 'dr-5', gmail_thread_id: 't9', status: 'pending',
      to_summary: 'ann@client.com', subject: 'Your quote',
    })
  })

  it('refuses a draft with no recipient, now rather than at send time', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [] })
    draftHeaders = [{ name: 'Subject', value: 'x' }]
    expect((await SCHEDULE(json({ userId: 'u1', draftId: 'dr-5', sendAt: future }))).status).toBe(400)
  })

  it('refuses a time in the past', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [] })
    expect((await SCHEDULE(json({ userId: 'u1', draftId: 'dr-5', sendAt: past }))).status).toBe(400)
  })

  it('rescheduling moves the time instead of adding a second', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({ gmail_draft_id: 'dr-5', send_at: future })] })
    const later = new Date(Date.now() + 7_200_000).toISOString()
    await SCHEDULE(json({ userId: 'u1', draftId: 'dr-5', sendAt: later }))
    expect(db.tables.scheduled_emails).toHaveLength(1)
    expect(db.tables.scheduled_emails[0].send_at).toBe(later)
  })

  it('lists only the person’s own, in this company', async () => {
    db = fakeDb({
      gmail_tokens: [tokens],
      scheduled_emails: [sched({ send_at: future }), sched({ id: 'x', user_id: 'u2' }), sched({ id: 'y', tenant_id: 'ten2' }), sched({ id: 'z', status: 'sent' })],
    })
    const body = await (await LIST(withQs('userId=u1'))).json()
    expect(body.scheduled.map((s: { id: string }) => s.id)).toEqual(['s1'])
  })

  it('cancels a waiting one, and not one already sending', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({ send_at: future }), sched({ id: 's2', status: 'sending' })] })
    expect((await CANCEL(withQs('userId=u1&id=s1', 'DELETE'))).status).toBe(200)
    expect(db.tables.scheduled_emails[0].status).toBe('cancelled')
    expect((await CANCEL(withQs('userId=u1&id=s2', 'DELETE'))).status).toBe(409)
  })

  it('cannot cancel someone else’s', async () => {
    db = fakeDb({ gmail_tokens: [tokens], scheduled_emails: [sched({ user_id: 'u2', send_at: future })] })
    expect((await CANCEL(withQs('userId=u1&id=s1', 'DELETE'))).status).toBe(409)
    expect(db.tables.scheduled_emails[0].status).toBe('pending')
  })
})
