import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeDb } from '@/lib/__tests__/_fake-db'
import { applyRulesToNewMail } from '@/lib/email/apply-rules'
import type { MailRule } from '@/lib/email/mail-rules'

// ============================================
// Rules, report spam and select-all — the routes, against a fake Gmail
// ============================================

let role = 'manager'
let db = fakeDb({})
let mailbox: Array<{ id: string; q: string }> = []
const batches: Array<{ ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }> = []
let labels: Array<{ id: string; name: string }> = []
const created: string[] = []
const queries: string[] = []

function gmail() {
  return {
    users: {
      labels: {
        list: async () => ({ data: { labels } }),
        create: async ({ requestBody }: { requestBody: { name: string } }) => {
          created.push(requestBody.name)
          const l = { id: `Label_${labels.length + 1}`, name: requestBody.name }
          labels.push(l)
          return { data: l }
        },
      },
      messages: {
        list: async ({ q, pageToken }: { q?: string; pageToken?: string }) => {
          queries.push(q ?? '')
          const all = mailbox.filter(m => !q || m.q === q || q === '' || q.includes(m.q))
          const start = pageToken ? Number(pageToken) : 0
          const page = all.slice(start, start + 500)
          return { data: { messages: page.map(m => ({ id: m.id })), nextPageToken: start + 500 < all.length ? String(start + 500) : undefined } }
        },
        batchModify: async ({ requestBody }: { requestBody: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] } }) => {
          batches.push(requestBody)
          return { data: {} }
        },
      },
    },
  }
}

vi.mock('@/lib/gmail', async () => {
  const real = await vi.importActual<typeof import('@/lib/gmail')>('@/lib/gmail')
  return { ...real, getGmailClient: () => gmail(), refreshAccessToken: async () => ({ access_token: 'a' }) }
})
vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, user: { id: 'u1' }, tenant_id: 'ten1', role, supabase: db }),
  createAdminClient: () => db,
}))

const RULES = await import('@/app/api/email/rules/route')
const RULE = await import('@/app/api/email/rules/[id]/route')
const RUN = await import('@/app/api/email/rules/[id]/run/route')
const ACTIONS = await import('@/app/api/gmail/actions/route')
const IDS = await import('@/app/api/gmail/ids/route')

const req = (method: string, b?: unknown) => new Request('http://x', { method, ...(b ? { body: JSON.stringify(b) } : {}) }) as never
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const withQs = (qs: string) => { const u = new URL(`http://x/a?${qs}`); return Object.assign(new Request(u), { nextUrl: u }) as never }
const tokens = { user_id: 'u1', tenant_id: 'ten1', access_token: 'a', refresh_token: 'r', token_expiry: '2999-01-01' }

beforeEach(() => {
  role = 'manager'
  mailbox = []
  batches.length = 0
  labels = [{ id: 'Label_1', name: 'Bookings' }]
  created.length = 0
  queries.length = 0
  db = fakeDb({
    gmail_tokens: [tokens],
    email_rules: [
      { id: 'r1', tenant_id: 'ten1', name: 'Booking.com', enabled: true, conditions: { from: 'booking.com' }, actions: { folder: 'Bookings' }, created_at: '1' },
      { id: 'r9', tenant_id: 'ten2', name: 'Other company', enabled: true, conditions: { from: 'x' }, actions: { delete: true }, created_at: '1' },
    ],
  })
})

describe('rules: who may do what', () => {
  it('everyone in the company sees its rules — and only its rules', async () => {
    role = 'member'
    const d = await (await RULES.GET()).json()
    expect(d.rules.map((r: { id: string }) => r.id)).toEqual(['r1'])
    expect(d.canEdit).toBe(false)
  })
  it('members and viewers cannot create, change, delete or run them', async () => {
    for (const r of ['member', 'viewer']) {
      role = r
      expect((await RULES.POST(req('POST', { conditions: { from: 'a' }, actions: { star: true } }))).status).toBe(403)
      expect((await RULE.PATCH(req('PATCH', { enabled: false }), ctx('r1'))).status).toBe(403)
      expect((await RULE.DELETE(req('DELETE'), ctx('r1'))).status).toBe(403)
      expect((await RUN.POST(req('POST'), ctx('r1'))).status).toBe(403)
    }
    expect(db.tables.email_rules).toHaveLength(2)
  })
  it('managers create, switch off and delete — in their own company only', async () => {
    const created = await (await RULES.POST(req('POST', { conditions: { subject: 'invoice' }, actions: { star: true } }))).json()
    expect(created.rule).toMatchObject({ tenant_id: 'ten1', enabled: true, conditions: { subject: 'invoice' } })
    expect((await RULE.PATCH(req('PATCH', { enabled: false }), ctx('r1'))).status).toBe(200)
    expect(db.tables.email_rules.find(r => r.id === 'r1')?.enabled).toBe(false)
    expect((await RULE.PATCH(req('PATCH', { enabled: false }), ctx('r9'))).status).toBe(404)
    expect((await RULE.DELETE(req('DELETE'), ctx('r9'))).status).toBe(404)
    expect((await RULE.DELETE(req('DELETE'), ctx('r1'))).status).toBe(200)
    expect(db.tables.email_rules.map(r => r.id)).toEqual(['r9', created.rule.id])
  })
  it('an unusable rule is refused with the reason', async () => {
    const res = await RULES.POST(req('POST', { conditions: {}, actions: { star: true } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/condition/)
  })
})

describe('apply a rule to the Inbox now', () => {
  it('finds matching Inbox mail with Gmail search and files it', async () => {
    mailbox = [{ id: 'm1', q: 'in:inbox from:"booking.com"' }, { id: 'm2', q: 'in:inbox from:"booking.com"' }]
    const d = await (await RUN.POST(req('POST'), ctx('r1'))).json()
    expect(d).toMatchObject({ success: true, applied: 2 })
    expect(queries[0]).toBe('in:inbox from:"booking.com"')
    expect(batches[0]).toEqual({ ids: ['m1', 'm2'], addLabelIds: ['Label_1'], removeLabelIds: [] })
  })
  it('another company’s rule cannot be run', async () => {
    expect((await RUN.POST(req('POST'), ctx('r9'))).status).toBe(404)
  })
})

describe('rules at sync', () => {
  const m = (id: string, from: string, subject: string, labelIds = ['INBOX', 'UNREAD']) => ({
    id, labelIds, snippet: '', payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: 'ops@a.com' }, { name: 'Subject', value: subject }] },
  })
  it('files, creates a missing folder, and removes spam/trash from the conversations', async () => {
    const rules: MailRule[] = [
      { id: 'a', name: 'a', enabled: true, conditions: { from: 'booking.com' }, actions: { folder: 'Bookings', markRead: true } },
      { id: 'b', name: 'b', enabled: true, conditions: { subject: 'newsletter' }, actions: { folder: 'News' } },
      { id: 'c', name: 'c', enabled: true, conditions: { from: 'casino' }, actions: { spam: true } },
    ]
    const msgs = [m('1', 'noreply@booking.com', 'Res'), m('2', 'x@y.com', 'Weekly newsletter'), m('3', 'win@casino.biz', 'Prize'), m('4', 'me@a.com', 'sent', ['SENT'])]
    const g = gmail() as never
    const r = await applyRulesToNewMail(g, rules, msgs as never)
    expect(r.applied).toBe(3)
    expect([...r.removedIds]).toEqual(['3'])
    expect(created).toEqual(['News'])
    expect(msgs[0].labelIds).toEqual(['INBOX', 'Label_1'])
    expect(msgs[3].labelIds).toEqual(['SENT'])
  })
  it('the sync runs the company’s rules and leaves spam out', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/email/sync/route.ts'), 'utf8')
    expect(src).toContain("from('email_rules')")
    expect(src).toMatch(/\.eq\('tenant_id', tenant_id\)\s*\.eq\('enabled', true\)/)
    expect(src).toContain('if (detail.id && ruleRemoved.has(detail.id)) continue')
  })
})

describe('report spam and select all', () => {
  it('report spam moves emails to Spam and out of the Inbox', async () => {
    const res = await ACTIONS.POST(req('POST', { userId: 'u1', messageIds: ['a', 'b'], action: 'spam' }))
    expect(res.status).toBe(200)
    expect(batches).toEqual([{ ids: ['a', 'b'], addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] }])
  })
  it('acts on 5,000 at once in batches of 1,000, and refuses more', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `m${i}`)
    await ACTIONS.POST(req('POST', { userId: 'u1', messageIds: ids, action: 'archive' }))
    expect(batches.map(b => b.ids.length)).toEqual([1000, 1000, 1000, 1000, 1000])
    batches.length = 0
    expect((await ACTIONS.POST(req('POST', { userId: 'u1', messageIds: [...ids, 'x'], action: 'archive' }))).status).toBe(400)
    expect(batches).toEqual([])
  })
  it('lists every email in a folder or search, up to 5,000', async () => {
    mailbox = Array.from({ length: 1200 }, (_, i) => ({ id: `m${i}`, q: 'in:inbox' }))
    const d = await (await IDS.GET(withQs('userId=u1&query=in:inbox'))).json()
    expect(d.ids).toHaveLength(1200)
    expect(d.truncated).toBe(false)
    mailbox = Array.from({ length: 6000 }, (_, i) => ({ id: `m${i}`, q: 'in:inbox' }))
    const big = await (await IDS.GET(withQs('userId=u1&query=in:inbox'))).json()
    expect(big.ids).toHaveLength(5000)
    expect(big.truncated).toBe(true)
  })
})
