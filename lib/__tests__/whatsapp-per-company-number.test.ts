import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import {
  toWhatsAppE164, sharedWhatsAppNumber, tenantForWhatsAppNumber, whatsAppSenderFor, checkTenantWhatsAppNumber,
} from '@/lib/whatsapp-tenant'
import { twilioSignatureUrls } from '@/lib/twilio-signature'

// ============================================
// A company's own WhatsApp number (migration 408; operator, 2026-10-11:
// Twilio, one account, the shared number as the fallback).
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

// tenants as the lookups read it: by whatsapp_number or by id.
const tenantsDb = (rows: Array<{ id: string; whatsapp_number: string | null }>, error: { message: string } | null = null) => ({
  from: () => ({
    select: () => ({
      eq: (col: string, value: string) => ({
        maybeSingle: async () => ({ data: rows.find(r => (r as Record<string, unknown>)[col] === value) ?? null, error }),
      }),
    }),
  }),
})

const env = { ...process.env }
beforeEach(() => { process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886' })
afterEach(() => { process.env = { ...env } })

describe('the numbers', () => {
  it('are E.164, whatever the spelling', () => {
    expect(toWhatsAppE164('whatsapp:+81 3-1234-5678')).toBe('+81312345678')
    expect(toWhatsAppE164('0081312345678')).toBe('+81312345678')
    expect(toWhatsAppE164('03-1234-5678')).toBeNull()
    expect(toWhatsAppE164('')).toBeNull()
    expect(sharedWhatsAppNumber()).toBe('+14155238886')
  })

  it('a message to a company’s number is that company’s; any other number is the shared one', async () => {
    const db = tenantsDb([{ id: 'ats', whatsapp_number: '+81312345678' }])
    expect(await tenantForWhatsAppNumber(db, 'whatsapp:+81312345678')).toBe('ats')
    expect(await tenantForWhatsAppNumber(db, '+14155238886')).toBeNull()
    await expect(tenantForWhatsAppNumber(tenantsDb([], { message: 'down' }), '+81312345678')).rejects.toThrow('down')
  })

  it('a company sends from its own number, else the shared one — nobody is cut off', async () => {
    const db = tenantsDb([{ id: 'ats', whatsapp_number: '+81312345678' }, { id: 't2e', whatsapp_number: null }])
    expect(await whatsAppSenderFor(db, 'ats')).toBe('whatsapp:+81312345678')
    expect(await whatsAppSenderFor(db, 't2e')).toBe('whatsapp:+14155238886')
    expect(await whatsAppSenderFor(db, null)).toBe('whatsapp:+14155238886')
    // A failed lookup still sends, from the shared number.
    const broken = { from: () => { throw new Error('down') } } as never
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await whatsAppSenderFor(broken, 'ats')).toBe('whatsapp:+14155238886')
  })

  it('the Autoura team gives a real number, never the shared one; blank goes back to it', () => {
    expect(checkTenantWhatsAppNumber('+81 3 1234 5678')).toEqual({ ok: true, number: '+81312345678' })
    expect(checkTenantWhatsAppNumber('')).toEqual({ ok: true, number: null })
    expect(checkTenantWhatsAppNumber('03 1234 5678')).toMatchObject({ ok: false, status: 400 })
    expect(checkTenantWhatsAppNumber('+1 415 523 8886')).toMatchObject({ ok: false, status: 409 })
  })

  it('only a super admin sets it', () => {
    const route = src('app/api/super-admin/tenants/[id]/whatsapp/route.ts')
    expect(route).toContain('const auth = await requireSuperAdmin()')
    expect(route).toContain("That number already belongs to another company.")
    expect(src('supabase/migrations/408_tenant_whatsapp_number.sql')).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_whatsapp_number_unique')
  })
})

describe('every send says whose it is', () => {
  it('the sender requires the tenant and sends from the company’s number', () => {
    const twilio = src('lib/twilio-whatsapp.ts')
    expect(twilio).toContain('  tenantId: string | null\n')
    expect(twilio).toContain('const from = await whatsAppSenderFor(await adminForSender(), tenantId)')
    expect(twilio).not.toContain('const from = process.env.TWILIO_WHATSAPP_FROM')
  })
  it('the inbox, Copilot, the AI agent and the auto-reply pass it', () => {
    expect(src('app/api/whatsapp/messages/route.ts')).toContain('tenantId: tenant_id ?? null,')
    expect(src('app/api/copilot/drafts/[id]/send/route.ts')).toContain('tenantId: tenant_id })')
    expect(src('lib/whatsapp-ai-agent.ts')).toContain('tenantId: this.tenantId')
    expect(src('app/api/whatsapp/webhook/route.ts')).toMatch(/body: aiResponse\.reply,\s+tenantId\s+\}/)
  })
})

describe('Twilio’s signature', () => {
  it('is checked against every URL it may have signed — the proxy’s, the public one, www and bare', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://autoura.net'
    const req = {
      url: 'http://10.0.0.5:3000/api/whatsapp/webhook',
      headers: new Headers({ 'x-forwarded-host': 'autoura.net', 'x-forwarded-proto': 'https' }),
    }
    expect(twilioSignatureUrls(req as never)).toEqual([
      'http://10.0.0.5:3000/api/whatsapp/webhook',
      'https://autoura.net/api/whatsapp/webhook',
      'https://www.autoura.net/api/whatsapp/webhook',
    ])
    for (const f of ['app/api/whatsapp/webhook/route.ts', 'app/api/whatsapp/status-callback/route.ts']) {
      expect(src(f)).toContain('isValidTwilioSignature(authToken, signature, request, params)')
    }
  })
})

describe('the settings page', () => {
  it('reads the status route and sends the test to the field the route reads', () => {
    const page = src('app/settings/whatsapp/page.tsx')
    expect(page).toContain("fetch('/api/whatsapp/status')")
    expect(page).toContain('body: JSON.stringify({ phone: testPhone })')
  })
})

// --- the webhook, with a database that records what it was asked ---------
type Row = Record<string, unknown>
const inserts: Array<{ table: string; row: Row }> = []
const filters: Array<{ table: string; col: string; value: unknown }> = []
let owner: string | null = 'ats'

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = 'select'
      const c: Record<string, unknown> = {}
      const self = () => c
      Object.assign(c, {
        select: self, in: self, is: self, order: self, limit: self,
        eq: (col: string, value: unknown) => { filters.push({ table, col, value }); return c },
        update: () => { op = 'update'; return c },
        insert: (row: Row) => { op = 'insert'; inserts.push({ table, row }); return c },
        maybeSingle: async () => {
          if (table === 'tenants') return { data: owner ? { id: owner } : null, error: null }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'clients') return { data: { id: 'client-new', full_name: 'Yuki Tanaka' }, error: null }
          if (table === 'whatsapp_conversations') return { data: { id: 'conv-new', tenant_id: owner }, error: null }
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
vi.mock('@/lib/notifications', () => ({ notifyTeam: async () => {}, bellSnippet: (s: string) => s }))
vi.mock('@/lib/copilot-suggest', () => ({ generateDraftReplies: async () => {} }))
vi.mock('@/lib/whatsapp-ai-agent', () => ({ processIncomingMessage: async () => ({ success: false }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async () => ({ success: true }) }))

const inbound = (to: string) => new NextRequest('http://x/api/whatsapp/webhook', {
  method: 'POST',
  headers: { 'x-twilio-signature': 'sig', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ From: 'whatsapp:+819012345678', To: `whatsapp:${to}`, Body: 'Hello, a tour in May?', MessageSid: 'SM9', ProfileName: 'Yuki Tanaka' }).toString(),
})

describe('a first message to a company’s own number', () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'token'
    inserts.length = 0
    filters.length = 0
    owner = 'ats'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reaches that company: the sender becomes its prospect, the conversation and message are its', async () => {
    const { POST } = await import('@/app/api/whatsapp/webhook/route')
    expect((await POST(inbound('+81312345678'))).status).toBe(200)
    expect(filters).toContainEqual({ table: 'tenants', col: 'whatsapp_number', value: '+81312345678' })
    // Only that company's conversation and clients are looked at.
    expect(filters).toContainEqual({ table: 'whatsapp_conversations', col: 'tenant_id', value: 'ats' })
    expect(filters).toContainEqual({ table: 'clients', col: 'tenant_id', value: 'ats' })
    expect(inserts.map(i => [i.table, i.row.tenant_id])).toEqual([
      ['clients', 'ats'], ['whatsapp_conversations', 'ats'], ['whatsapp_messages', 'ats'],
      ['communication_threads', 'ats'],
    ])
  })

  it('to the shared number from a stranger is still nobody’s (as before)', async () => {
    owner = null
    const { POST } = await import('@/app/api/whatsapp/webhook/route')
    expect((await POST(inbound('+14155238886'))).status).toBe(200)
    expect(inserts).toEqual([])
  })
})
