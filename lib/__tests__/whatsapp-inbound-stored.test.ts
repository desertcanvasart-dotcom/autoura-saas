import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

// ============================================
// Incoming WhatsApp is stored (2026-10-11). The webhook ran on the anonymous
// browser client; the WhatsApp tables only show a signed-in user's own
// company's rows, so every lookup was empty, every insert refused — and the
// webhook still answered 200, so the provider never re-sent. Messages were
// lost without a trace.
// ============================================

type Row = Record<string, unknown>
let conversation: Row | null = null
let insertError: { code?: string; message: string } | null = null
let lookupError: { message: string } | null = null
const inserts: Array<{ table: string; row: Row }> = []
const sends: unknown[] = []

function adminDb() {
  const chain = (table: string) => {
    let op = 'select'
    const c: Record<string, unknown> = {}
    const self = () => c
    Object.assign(c, {
      select: self, eq: self, in: self, is: self, order: self, limit: self,
      update: () => { op = 'update'; return c },
      insert: (row: Row) => { op = 'insert'; inserts.push({ table, row }); return c },
      maybeSingle: async () => {
        if (table === 'whatsapp_conversations') return { data: conversation, error: lookupError }
        return { data: null, error: null }
      },
      single: async () => (table === 'tenant_features' ? { data: { whatsapp_ai_enabled: true } } : { data: { id: 'new' }, error: null }),
      then: (res: (v: unknown) => unknown) => {
        const v = op === 'insert' && table === 'whatsapp_messages'
          ? { error: insertError }
          : table === 'clients' ? { data: [], error: null } : { data: null, error: null }
        return Promise.resolve(v).then(res)
      },
    })
    return c
  }
  return { from: chain }
}

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => adminDb() }))
vi.mock('twilio', () => ({ default: { validateRequest: () => true } }))
vi.mock('@/lib/notifications', () => ({ notifyTeam: async () => {}, bellSnippet: (s: string) => s }))
vi.mock('@/lib/copilot-suggest', () => ({ generateDraftReplies: async () => {} }))
vi.mock('@/lib/whatsapp-ai-agent', () => ({
  processIncomingMessage: async () => ({ success: true, shouldRespond: true, reply: 'Hello!' }),
}))
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: async (m: unknown) => { sends.push(m); return { success: true, messageId: 'SMout' } },
}))

import { POST } from '@/app/api/whatsapp/webhook/route'

const inbound = () => new NextRequest('http://x/api/whatsapp/webhook', {
  method: 'POST',
  headers: { 'x-twilio-signature': 'sig', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ From: 'whatsapp:+201234567890', To: 'whatsapp:+14155238886', Body: 'Is my pickup at 8?', MessageSid: 'SM1' }).toString(),
})

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.WHATSAPP_AI_ENABLED = 'true'
  conversation = { id: 'conv1', tenant_id: 't1', client_id: 'c1' }
  insertError = null
  lookupError = null
  inserts.length = 0
  sends.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('an incoming WhatsApp message', () => {
  it('is stored under its conversation’s company, and the AI reply goes out from that company', async () => {
    const res = await POST(inbound())
    expect(res.status).toBe(200)
    expect(inserts.find(i => i.table === 'whatsapp_messages' && i.row.direction === 'inbound')?.row)
      .toMatchObject({ tenant_id: 't1', conversation_id: 'conv1', message_sid: 'SM1', message_body: 'Is my pickup at 8?' })
    expect(sends).toEqual([expect.objectContaining({ to: '+201234567890', tenantId: 't1' })])
  })

  it('that could not be stored is asked for again (500), not acknowledged and lost', async () => {
    insertError = { code: '08006', message: 'connection failure' }
    expect((await POST(inbound())).status).toBe(500)
    expect(sends).toEqual([])
    insertError = null
    lookupError = { message: 'timeout' }
    expect((await POST(inbound())).status).toBe(500)
  })

  it('re-delivered after it was stored is acknowledged and not answered twice', async () => {
    insertError = { code: '23505', message: 'duplicate key' }
    expect((await POST(inbound())).status).toBe(200)
    expect(sends).toEqual([])
  })

  it('from a number no company knows is acknowledged and nothing is stored', async () => {
    conversation = null
    expect((await POST(inbound())).status).toBe(200)
    expect(inserts).toEqual([])
  })

  it('is never read or written through the browser client', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/api/whatsapp/webhook/route.ts'), 'utf8')
    expect(src).not.toContain("from '@/app/supabase'")
    expect(src).toContain('const supabase = createAdminClient()')
  })
})
