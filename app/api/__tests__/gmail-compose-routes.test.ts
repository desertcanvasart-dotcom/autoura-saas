import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// Cc/Bcc, forwards, drafts and the conversation view — against a fake Gmail
// ============================================

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
const headerOf = (msg: string, name: string) => msg.split('\r\n\r\n')[0].split('\r\n').find(l => l.startsWith(`${name}: `))

const calls = {
  sent: [] as Array<{ raw: string; threadId?: string }>,
  draftCreate: [] as Array<{ raw: string; threadId?: string }>,
  draftUpdate: [] as Array<{ id: string; raw: string }>,
  draftDelete: [] as string[],
  attachmentGets: [] as string[],
}
let draftUpdateFails404 = false

function fakeGmail() {
  return {
    users: {
      messages: {
        send: async ({ requestBody }: { requestBody: { raw: string; threadId?: string } }) => {
          calls.sent.push(requestBody)
          return { data: { id: 'sent-1', threadId: requestBody.threadId ?? 'th-new' } }
        },
        attachments: {
          get: async ({ id }: { id: string }) => {
            calls.attachmentGets.push(id)
            return { data: { data: Buffer.from(`content-of-${id}`).toString('base64url') } }
          },
        },
      },
      threads: {
        get: async () => ({
          data: {
            messages: [
              { id: 'm2', threadId: 't1', internalDate: '2000', labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: 'b@x.com' }, { name: 'Subject', value: 'Re: Hi' }] } },
              { id: 'd1', threadId: 't1', internalDate: '3000', labelIds: ['DRAFT'], payload: { headers: [{ name: 'From', value: 'me@x.com' }] } },
              { id: 'm1', threadId: 't1', internalDate: '1000', labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: 'a@x.com' }, { name: 'Cc', value: 'c@x.com' }, { name: 'Subject', value: 'Hi' }] } },
            ],
          },
        }),
      },
      drafts: {
        create: async ({ requestBody }: { requestBody: { message: { raw: string; threadId?: string } } }) => {
          calls.draftCreate.push(requestBody.message)
          return { data: { id: `dr-${calls.draftCreate.length}`, message: { id: 'dm-1' } } }
        },
        update: async ({ id, requestBody }: { id: string; requestBody: { message: { raw: string } } }) => {
          if (draftUpdateFails404) throw Object.assign(new Error('gone'), { code: 404 })
          calls.draftUpdate.push({ id, raw: requestBody.message.raw })
          return { data: { id, message: { id: 'dm-1' } } }
        },
        delete: async ({ id }: { id: string }) => { calls.draftDelete.push(id); return { data: {} } },
        list: async () => ({ data: { drafts: [{ id: 'dr-9', message: { id: 'msg-9' } }] } }),
        get: async () => ({
          data: {
            id: 'dr-9',
            message: {
              id: 'msg-9', threadId: 't1',
              payload: {
                mimeType: 'multipart/mixed',
                headers: [
                  { name: 'To', value: 'a@x.com' }, { name: 'Cc', value: 'c@x.com' }, { name: 'Bcc', value: 'secret@x.com' },
                  { name: 'Subject', value: 'Half written' },
                ],
                parts: [
                  { mimeType: 'text/html', body: { data: Buffer.from('<p>so far</p>').toString('base64') } },
                  { mimeType: 'application/pdf', filename: 'quote.pdf', body: { attachmentId: 'att-1' } },
                ],
              },
            },
          },
        }),
      },
    },
  }
}

vi.mock('@/lib/gmail', async () => {
  const real = await vi.importActual<typeof import('@/lib/gmail')>('@/lib/gmail')
  return { ...real, getGmailClient: () => fakeGmail(), refreshAccessToken: async () => ({ access_token: 'a' }) }
})
vi.mock('@/lib/email/threading', async () => {
  const real = await vi.importActual<typeof import('@/lib/email/threading')>('@/lib/email/threading')
  return { ...real, replyHeaders: async () => ({ inReplyTo: '<orig@x>', references: '<orig@x>' }) }
})
vi.mock('@/lib/supabase-server', () => {
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q; q.eq = () => q; q.update = () => q; q.insert = () => q; q.in = () => q
      q.maybeSingle = async () => ({ data: { access_token: 'a', refresh_token: 'r', token_expiry: '2999-01-01', email: 'me@agency.com' }, error: null })
      q.single = async () => ({ data: null, error: null })
      q.then = (res: (v: unknown) => unknown) => res({ data: null, error: null })
      return q
    },
  }
  return {
    requireAuth: async () => ({ error: null, status: 200, user: { id: 'u1', email: 'me@agency.com' }, tenant_id: 'ten1', role: 'member', supabase: db }),
    createAdminClient: () => db,
  }
})

import { POST as SEND } from '@/app/api/gmail/send/route'
import { GET as DRAFT_GET, POST as DRAFT_POST, DELETE as DRAFT_DELETE } from '@/app/api/gmail/drafts/route'
import { GET as THREAD_GET } from '@/app/api/gmail/threads/route'

const json = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never
const get = (qs: string) => {
  const url = new URL(`http://x/api?${qs}`)
  return Object.assign(new Request(url), { nextUrl: url }) as never
}

beforeEach(() => {
  for (const k of Object.keys(calls) as Array<keyof typeof calls>) calls[k].length = 0
  draftUpdateFails404 = false
})

describe('sending with Cc and Bcc', () => {
  it('puts To, Cc and Bcc on the message', async () => {
    const res = await SEND(json({ userId: 'u1', to: 'a@x.com', cc: 'b@x.com, C <c@x.com>', bcc: ['d@x.com'], subject: 'Hi', body: '<p>x</p>' }))
    expect(res.status).toBe(200)
    const msg = decode(calls.sent[0].raw)
    expect(headerOf(msg, 'To')).toBe('To: a@x.com')
    expect(headerOf(msg, 'Cc')).toBe('Cc: b@x.com, c@x.com')
    expect(headerOf(msg, 'Bcc')).toBe('Bcc: d@x.com')
  })

  it('names an address it cannot read, and sends nothing', async () => {
    const res = await SEND(json({ userId: 'u1', to: 'a@x.com', cc: 'not an address', subject: 'Hi', body: 'x' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('not an address')
    expect(calls.sent).toHaveLength(0)
  })

  it('carries a forwarded message’s attachments, fetched from the mailbox', async () => {
    await SEND(json({
      userId: 'u1', to: 'a@x.com', subject: 'Fwd: Hi', body: 'x',
      forward_attachments: [{ messageId: 'm1', attachmentId: 'att-7', filename: 'voucher.pdf', mimeType: 'application/pdf' }],
    }))
    expect(calls.attachmentGets).toEqual(['att-7'])
    const msg = decode(calls.sent[0].raw)
    expect(msg).toContain('filename="voucher.pdf"')
    expect(msg).toContain(Buffer.from('content-of-att-7').toString('base64'))
  })

  it('removes the saved draft once the mail is sent', async () => {
    await SEND(json({ userId: 'u1', to: 'a@x.com', subject: 'Hi', body: 'x', gmail_draft_id: 'dr-5' }))
    expect(calls.draftDelete).toEqual(['dr-5'])
  })
})

describe('drafts', () => {
  it('creates a draft, threaded when it answers a conversation', async () => {
    const res = await DRAFT_POST(json({ userId: 'u1', to: 'a@x.com', bcc: 'd@x.com', subject: 'Re: Hi', body: '<p>x</p>', threadId: 't1' }))
    const d = await res.json()
    expect(d.draftId).toBe('dr-1')
    expect(calls.draftCreate[0].threadId).toBe('t1')
    const msg = decode(calls.draftCreate[0].raw)
    expect(msg).toContain('In-Reply-To: <orig@x>')
    expect(headerOf(msg, 'Bcc')).toBe('Bcc: d@x.com')
  })

  it('saves a half-written recipient line without refusing the draft', async () => {
    const res = await DRAFT_POST(json({ userId: 'u1', to: 'a@x.com, bo', subject: '', body: '' }))
    expect(res.status).toBe(200)
  })

  it('updates the same draft on later saves', async () => {
    await DRAFT_POST(json({ userId: 'u1', draftId: 'dr-3', to: 'a@x.com', subject: 'v2', body: 'x' }))
    expect(calls.draftUpdate.map(u => u.id)).toEqual(['dr-3'])
    expect(calls.draftCreate).toHaveLength(0)
  })

  it('starts a new draft when the old one was sent or deleted elsewhere', async () => {
    draftUpdateFails404 = true
    const d = await (await DRAFT_POST(json({ userId: 'u1', draftId: 'dr-3', to: 'a@x.com', subject: 'v2', body: 'x' }))).json()
    expect(d.draftId).toBe('dr-1')
  })

  it('reopens a draft from its message id with everything it held, attachments included', async () => {
    const d = await (await DRAFT_GET(get('userId=u1&messageId=msg-9'))).json()
    expect(d).toMatchObject({ draftId: 'dr-9', to: 'a@x.com', cc: 'c@x.com', bcc: 'secret@x.com', subject: 'Half written', threadId: 't1' })
    expect(d.body).toContain('so far')
    expect(d.attachments).toEqual([
      { filename: 'quote.pdf', mimeType: 'application/pdf', data: Buffer.from('content-of-att-1').toString('base64'), size: 16 },
    ])
  })

  it('discards', async () => {
    expect((await DRAFT_DELETE(get('userId=u1&draftId=dr-4'))).status).toBe(200)
    expect(calls.draftDelete).toEqual(['dr-4'])
  })

  it('only in the session’s own mailbox', async () => {
    expect((await DRAFT_GET(get('userId=someone-else&draftId=dr-9'))).status).toBe(403)
  })
})

describe('the conversation view', () => {
  it('returns the whole thread oldest first, without drafts, with Cc', async () => {
    const d = await (await THREAD_GET(get('userId=u1&threadId=t1'))).json()
    expect(d.messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2'])
    expect(d.messages[0].cc).toBe('c@x.com')
  })
})
