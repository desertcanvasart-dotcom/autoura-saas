import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The Email tab's Suggest Reply asks by Gmail thread; the route finds the
// conversation the thread is filed under (app/api/ai/suggest-email-reply).

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }))

function from(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
    not: (c: string) => { rows = rows.filter(r => r[c] != null); return q },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ supabase: { from }, tenant_id: 'T1', user: { id: 'U1' }, status: 200 }),
}))
vi.mock('@/lib/ai-guard', () => ({ aiBudgetDenied: async () => null }))
const generateDraftReplies = vi.hoisted(() => vi.fn(async (args: { unifiedConversationId: string }) => ({
  success: true, thread_id: 'ct', inbox_message_id: 'ib', tone: 'professional', drafts: [{ id: 'd1', draft_body: 'Hi' }], conv: args.unifiedConversationId,
})))
vi.mock('@/lib/copilot-suggest', () => ({ generateDraftReplies }))

import { GET, POST } from '@/app/api/ai/suggest-email-reply/route'

const post = (body: unknown) => POST(new NextRequest('http://x/api/ai/suggest-email-reply', { method: 'POST', body: JSON.stringify(body) }))
const get = (qs: string) => GET(new NextRequest(`http://x/api/ai/suggest-email-reply?${qs}`))

beforeEach(() => {
  generateDraftReplies.mockClear()
  state.tables = {
    email_messages: [
      { tenant_id: 'T1', gmail_thread_id: 'th-1', unified_conversation_id: 'conv-1', sent_at: '2026-11-28T09:00:00Z' },
      // Another company's mail in a thread of the same id is never used.
      { tenant_id: 'T2', gmail_thread_id: 'th-2', unified_conversation_id: 'conv-other', sent_at: '2026-11-28T09:00:00Z' },
    ],
    communication_threads: [], communication_inbox: [], communication_drafts: [],
  }
})

describe('suggest-email-reply by Gmail thread', () => {
  it('POST drafts for the conversation the thread is filed under', async () => {
    const res = await post({ gmail_thread_id: 'th-1', count: 2 })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(generateDraftReplies).toHaveBeenCalledWith(expect.objectContaining({ unifiedConversationId: 'conv-1', tenantId: 'T1' }))
    expect(data.unified_conversation_id).toBe('conv-1')
  })

  it('POST for a thread not synced yet says so and drafts nothing', async () => {
    const res = await post({ gmail_thread_id: 'th-unknown' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/not reached Conversations yet/)
    expect(generateDraftReplies).not.toHaveBeenCalled()
  })

  it('never resolves another company\'s thread', async () => {
    const res = await post({ gmail_thread_id: 'th-2' })
    expect(res.status).toBe(404)
  })

  it('GET returns the conversation id with whatever is waiting', async () => {
    const data = await (await get('gmail_thread_id=th-1')).json()
    expect(data).toMatchObject({ success: true, drafts: [], unified_conversation_id: 'conv-1' })
  })

  it('GET for an unsynced thread is empty, not an error', async () => {
    const data = await (await get('gmail_thread_id=th-unknown')).json()
    expect(data).toEqual({ success: true, drafts: [], unified_conversation_id: null })
  })

  it('a conversation id still works as before', async () => {
    await post({ unified_conversation_id: 'conv-9' })
    expect(generateDraftReplies).toHaveBeenCalledWith(expect.objectContaining({ unifiedConversationId: 'conv-9' }))
  })
})
