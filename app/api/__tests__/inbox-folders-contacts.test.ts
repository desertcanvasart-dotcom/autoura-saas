import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeDb } from '@/lib/__tests__/_fake-db'

// ============================================
// Folders (rename, delete safely) and address suggestions
// ============================================

let labels: Array<{ id: string; name: string; type: string }> = []
let folderMessages: string[] = []
const modified: Array<{ ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }> = []
const deleted: string[] = []
const patched: Array<{ id: string; name?: string; color?: unknown }> = []
let db = fakeDb({})

vi.mock('@/lib/gmail', async () => {
  const real = await vi.importActual<typeof import('@/lib/gmail')>('@/lib/gmail')
  return {
    ...real,
    getGmailClient: () => ({
      users: {
        labels: {
          get: async ({ id }: { id: string }) => {
            const l = labels.find(x => x.id === id)
            if (!l) throw Object.assign(new Error('nf'), { code: 404 })
            return { data: { ...l, messagesTotal: folderMessages.length } }
          },
          list: async () => ({ data: { labels } }),
          patch: async ({ id, requestBody }: { id: string; requestBody: { name?: string; color?: unknown } }) => {
            if (requestBody.name && labels.some(l => l.name === requestBody.name && l.id !== id)) throw Object.assign(new Error('exists'), { code: 409 })
            patched.push({ id, ...requestBody })
            return { data: { id, ...requestBody } }
          },
          delete: async ({ id }: { id: string }) => { deleted.push(id); return { data: {} } },
        },
        messages: {
          list: async ({ pageToken }: { pageToken?: string }) => {
            const start = pageToken ? Number(pageToken) : 0
            const page = folderMessages.slice(start, start + 500)
            const next = start + 500 < folderMessages.length ? String(start + 500) : undefined
            return { data: { messages: page.map(id => ({ id })), nextPageToken: next } }
          },
          batchModify: async ({ requestBody }: { requestBody: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] } }) => {
            modified.push(requestBody)
            return { data: {} }
          },
        },
      },
    }),
  }
})
vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, user: { id: 'u1' }, tenant_id: 'ten1', role: 'member', supabase: db }),
  createAdminClient: () => db,
}))

const { PATCH, DELETE } = await import('@/app/api/gmail/labels/route')
const { GET: CONTACTS } = await import('@/app/api/email/contacts/route')

const body = (method: string, b: unknown) => new Request('http://x', { method, body: JSON.stringify(b) }) as never
const withQs = (qs: string) => { const u = new URL(`http://x/a?${qs}`); return Object.assign(new Request(u), { nextUrl: u }) as never }

beforeEach(() => {
  labels = [
    { id: 'L1', name: 'Clients', type: 'user' },
    { id: 'L2', name: 'Clients/Smith', type: 'user' },
    { id: 'L3', name: 'Suppliers', type: 'user' },
    { id: 'INBOX', name: 'INBOX', type: 'system' },
  ]
  folderMessages = []
  modified.length = 0
  deleted.length = 0
  patched.length = 0
  db = fakeDb({ gmail_tokens: [{ user_id: 'u1', tenant_id: 'ten1', access_token: 'a', refresh_token: 'r', token_expiry: '2999-01-01' }] })
})

describe('rename a folder', () => {
  it('renames it and its subfolders', async () => {
    const res = await PATCH(body('PATCH', { userId: 'u1', labelId: 'L1', name: 'Customers' }))
    expect(res.status).toBe(200)
    expect(patched).toEqual([{ id: 'L1', name: 'Customers' }, { id: 'L2', name: 'Customers/Smith' }])
  })
  it('says so when the name is taken', async () => {
    expect((await PATCH(body('PATCH', { userId: 'u1', labelId: 'L1', name: 'Suppliers' }))).status).toBe(409)
  })
  it('refuses a system folder or a reserved name', async () => {
    expect((await PATCH(body('PATCH', { userId: 'u1', labelId: 'INBOX', name: 'X' }))).status).toBe(400)
    expect((await PATCH(body('PATCH', { userId: 'u1', labelId: 'L1', name: 'Inbox' }))).status).toBe(400)
  })
  it('takes only Gmail palette colours', async () => {
    expect((await PATCH(body('PATCH', { userId: 'u1', labelId: 'L1', color: { backgroundColor: '#123456' } }))).status).toBe(400)
    expect((await PATCH(body('PATCH', { userId: 'u1', labelId: 'L1', color: { backgroundColor: '#16a766' } }))).status).toBe(200)
    expect(patched[0].color).toEqual({ backgroundColor: '#16a766', textColor: '#ffffff' })
  })
})

describe('delete a folder', () => {
  it('moves every email back to the Inbox first, then deletes it', async () => {
    folderMessages = Array.from({ length: 1200 }, (_, i) => `m${i}`)
    const res = await DELETE(body('DELETE', { userId: 'u1', labelId: 'L3' }))
    expect((await res.json()).movedToInbox).toBe(1200)
    const moved = modified.flatMap(m => m.ids)
    expect(moved).toHaveLength(1200)
    expect(modified.every(m => m.addLabelIds?.includes('INBOX') && m.removeLabelIds?.includes('L3'))).toBe(true)
    expect(modified.every(m => m.ids.length <= 1000)).toBe(true)
    expect(deleted).toEqual(['L3'])
  })
  it('an empty folder is just deleted', async () => {
    await DELETE(body('DELETE', { userId: 'u1', labelId: 'L3' }))
    expect(modified).toEqual([])
    expect(deleted).toEqual(['L3'])
  })
  it('never deletes a system folder', async () => {
    expect((await DELETE(body('DELETE', { userId: 'u1', labelId: 'INBOX' }))).status).toBe(400)
    expect(deleted).toEqual([])
  })
  it('leaves a huge folder alone and says why', async () => {
    folderMessages = Array.from({ length: 10_600 }, (_, i) => `m${i}`)
    expect((await DELETE(body('DELETE', { userId: 'u1', labelId: 'L3' }))).status).toBe(413)
    expect(modified).toEqual([])
    expect(deleted).toEqual([])
  })
})

describe('address suggestions', () => {
  it('from people emailed, clients and team — this company only', async () => {
    db = fakeDb({
      unified_conversations: [
        { tenant_id: 'ten1', contact_email: 'ann@client.com', contact_name: 'Ann', last_message_at: '2026-10-01' },
        { tenant_id: 'ten2', contact_email: 'ann@other.com', contact_name: 'Ann Other', last_message_at: '2026-10-05' },
      ],
      clients: [{ tenant_id: 'ten1', email: 'annabel@x.com', full_name: 'Annabel' }],
      team_members: [{ tenant_id: 'ten1', email: 'anna@agency.com', name: 'Anna' }],
    })
    // The fake applies eq; .or() and .not() are matched loosely, so add them.
    const fake = db as unknown as { from: (t: string) => Record<string, unknown> }
    const orig = fake.from
    fake.from = (t: string) => { const q = orig(t); q.or = () => q; q.not = () => q; return q }
    const d = await (await CONTACTS(withQs('q=ann'))).json()
    const emails = d.suggestions.map((s: { email: string }) => s.email)
    expect(emails).toEqual(['ann@client.com', 'annabel@x.com', 'anna@agency.com'])
    expect(emails).not.toContain('ann@other.com')
  })
})
