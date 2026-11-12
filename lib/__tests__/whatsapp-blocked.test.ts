import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { checkBlockNumber, findBlocked, inboundIsBlocked } from '@/lib/whatsapp-blocked'

// ============================================
// A company blocks WhatsApp numbers (migration 465; operator, 2026-11-12).
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('the numbers', () => {
  it('a manager blocks an E.164 number, whatever the spelling; anything else is refused', () => {
    expect(checkBlockNumber('whatsapp:+20 100 123 4567')).toEqual({ ok: true, number: '+201001234567' })
    expect(checkBlockNumber('00201001234567')).toEqual({ ok: true, number: '+201001234567' })
    expect(checkBlockNumber('0100 123 4567')).toMatchObject({ ok: false })
    expect(checkBlockNumber('')).toMatchObject({ ok: false })
  })

  it('the inbox finds a conversation’s block whichever way its number was stored', () => {
    const list = [{ id: 'b1', phone_number: '+201001234567' }]
    expect(findBlocked(list, '+201001234567')?.id).toBe('b1')
    expect(findBlocked(list, '201001234567')?.id).toBe('b1') // a legacy conversation stored without the +
    expect(findBlocked(list, '+201009999999')).toBeNull()
  })
})

// The block table as the webhook's check reads and counts it.
function blockedDb(rows: Array<{ id: string; tenant_id: string; phone_number: string; blocked_message_count: number }>, error: { message: string } | null = null) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = []
  const db = {
    from: () => ({
      select: () => {
        const f: Record<string, string> = {}
        const q = {
          eq: (c: string, v: string) => { f[c] = v; return q },
          maybeSingle: async () => ({
            data: rows.find(r => r.tenant_id === f.tenant_id && r.phone_number === f.phone_number) ?? null,
            error,
          }),
        }
        return q
      },
      update: (values: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => { updates.push({ id, values }); return { error: null } },
      }),
    }),
  }
  return { db: db as never, updates }
}

describe('the webhook’s check', () => {
  it('is per company, and counts the ignored message on the block — never its content', async () => {
    const { db, updates } = blockedDb([{ id: 'b1', tenant_id: 't2e', phone_number: '+201001234567', blocked_message_count: 4 }])
    expect(await inboundIsBlocked(db, 't2e', 'whatsapp:+201001234567')).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('b1')
    expect(updates[0].values.blocked_message_count).toBe(5)
    expect(Object.keys(updates[0].values).sort()).toEqual(['blocked_message_count', 'last_blocked_at'])
    // Another company's block is not this company's.
    expect(await inboundIsBlocked(db, 'ats', '+201001234567')).toBe(false)
    expect(await inboundIsBlocked(db, 't2e', '+201009999999')).toBe(false)
  })

  it('a failed lookup throws, so the provider delivers again instead of filing it', async () => {
    const { db } = blockedDb([], { message: 'down' })
    await expect(inboundIsBlocked(db, 't2e', '+201001234567')).rejects.toThrow('down')
  })
})

// --- the webhook, with a database that records what it was asked ---------
type Row = Record<string, unknown>
const inserts: Array<{ table: string; row: Row }> = []
const updates: Array<{ table: string; row: Row }> = []
let blocked = false
const notifyTeam = vi.fn(async () => {})
const aiReply = vi.fn(async () => ({ success: false }))

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = 'select'
      const c: Record<string, unknown> = {}
      const self = () => c
      Object.assign(c, {
        select: self, in: self, is: self, order: self, limit: self, eq: self,
        update: (row: Row) => { op = 'update'; updates.push({ table, row }); return c },
        insert: (row: Row) => { op = 'insert'; inserts.push({ table, row }); return c },
        maybeSingle: async () => {
          if (table === 'tenants') return { data: { id: 't2e' }, error: null }
          if (table === 'whatsapp_blocked_numbers') {
            return { data: blocked ? { id: 'b1', blocked_message_count: 2 } : null, error: null }
          }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'clients') return { data: { id: 'client-new', full_name: 'Spammer' }, error: null }
          if (table === 'whatsapp_conversations') return { data: { id: 'conv-new', tenant_id: 't2e' }, error: null }
          return { data: null, error: null }
        },
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(table === 'clients' && op === 'select' ? { data: [], error: null } : { data: null, error: null }).then(res),
      })
      return c
    },
  }),
}))
vi.mock('twilio', () => ({ default: { validateRequest: () => true } }))
vi.mock('@/lib/twilio-signature', () => ({ isValidTwilioSignature: () => true }))
vi.mock('@/lib/notifications', () => ({ notifyTeam, bellSnippet: (s: string) => s }))
vi.mock('@/lib/copilot-suggest', () => ({ generateDraftReplies: async () => {} }))
vi.mock('@/lib/whatsapp-ai-agent', () => ({ processIncomingMessage: aiReply }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async () => ({ success: true }) }))

const inbound = () => new NextRequest('http://x/api/whatsapp/webhook', {
  method: 'POST',
  headers: { 'x-twilio-signature': 'sig', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ From: 'whatsapp:+201001234567', To: 'whatsapp:+201551772258', Body: 'Buy now!!!', MessageSid: 'SM1', ProfileName: 'Spammer' }).toString(),
})

describe('a message from a blocked number', () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.WHATSAPP_AI_ENABLED = 'true'
    inserts.length = 0
    updates.length = 0
    notifyTeam.mockClear()
    aiReply.mockClear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('is not filed: no lead, conversation, message, bell or AI reply — only the count', async () => {
    blocked = true
    const { POST } = await import('@/app/api/whatsapp/webhook/route')
    expect((await POST(inbound())).status).toBe(200)
    expect(inserts).toEqual([])
    expect(notifyTeam).not.toHaveBeenCalled()
    expect(aiReply).not.toHaveBeenCalled()
    expect(updates.map(u => u.table)).toEqual(['whatsapp_blocked_numbers'])
    expect(updates[0].row.blocked_message_count).toBe(3)
  })

  it('the same sender, not blocked, is filed as before', async () => {
    blocked = false
    const { POST } = await import('@/app/api/whatsapp/webhook/route')
    expect((await POST(inbound())).status).toBe(200)
    expect(inserts.map(i => i.table)).toEqual(expect.arrayContaining(['clients', 'whatsapp_conversations', 'whatsapp_messages']))
    expect(notifyTeam).toHaveBeenCalled()
  })

  it('is checked before anything is created', () => {
    const route = src('app/api/whatsapp/webhook/route.ts')
    const check = route.indexOf('await inboundIsBlocked(')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(route.indexOf('const created = await createWhatsAppClient('))
    expect(check).toBeLessThan(route.indexOf(".from('whatsapp_messages')\n      .insert("))
  })
})

describe('the API and the pages', () => {
  it('only managers and above block or unblock; the number travels in the body', () => {
    const route = src('app/api/whatsapp/blocked/route.ts')
    expect(route.match(/roleDenied\(auth\.role, 'manage'\)/g)).toHaveLength(2)
    expect(route).toContain(".eq('tenant_id', auth.tenant_id)")
    expect(route).not.toContain('searchParams')
  })

  it('the inbox has Block/Unblock on a conversation and Settings lists the blocks', () => {
    const inbox = src('app/inbox/_views/WhatsAppView.tsx')
    expect(inbox).toContain("title={selectedBlock ? 'Unblock number' : 'Block number'}")
    expect(inbox).toContain("const canBlock = canAccess(['admin', 'manager'])")
    expect(src('app/settings/whatsapp/page.tsx')).toContain('<BlockedNumbersCard />')
  })
})
