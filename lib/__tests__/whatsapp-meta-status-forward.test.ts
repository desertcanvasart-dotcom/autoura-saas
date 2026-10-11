import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ============================================
// Meta delivery receipts only move a message's status forward (2026-10-11):
// they arrive out of order, and a late "sent" overwrote "read". The Twilio
// status callback already followed this rule (lib/whatsapp-status).
// ============================================

const updates: Array<{ status: unknown; sid: unknown; replaceable: unknown }> = []
let statuses: Array<{ messageSid: string; status: string; errorCode?: number; errorMessage?: string }> = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const row: { status?: unknown; sid?: unknown } = {}
      const c = {
        update: (v: { status: unknown }) => { row.status = v.status; return c },
        eq: (_col: string, sid: unknown) => { row.sid = sid; return c },
        in: async (_col: string, replaceable: unknown) => {
          updates.push({ status: row.status, sid: row.sid, replaceable })
          return { error: null }
        },
      }
      return c
    },
  }),
}))
vi.mock('@/lib/whatsapp-cloud-api', () => ({
  verifyMetaSignature: () => true,
  parseMetaWebhook: () => ({ messages: [], statuses }),
  fetchMetaMedia: async () => null,
}))
vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/notifications', () => ({ notifyTeam: async () => {}, bellSnippet: (s: string) => s }))
vi.mock('@/lib/copilot-suggest', () => ({ generateDraftReplies: async () => {} }))
vi.mock('@/lib/whatsapp-ai-agent', () => ({ processIncomingMessage: async () => ({ success: false }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async () => ({ success: true }) }))

import { POST } from '@/app/api/whatsapp/webhook/route'

const receipt = () => new NextRequest('http://x/api/whatsapp/webhook', {
  method: 'POST',
  headers: { 'x-hub-signature-256': 'sha256=x', 'content-type': 'application/json' },
  body: '{}',
})

beforeEach(() => {
  process.env.META_WHATSAPP_APP_SECRET = 'secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
  updates.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a Meta delivery receipt', () => {
  it('replaces only a status it outranks — a late "sent" never overwrites "read"', async () => {
    statuses = [
      { messageSid: 'wamid.1', status: 'read' },
      { messageSid: 'wamid.1', status: 'sent' },
      { messageSid: 'wamid.2', status: 'failed', errorCode: 131026, errorMessage: 'undeliverable' },
    ]
    expect((await POST(receipt())).status).toBe(200)
    expect(updates).toEqual([
      { status: 'read', sid: 'wamid.1', replaceable: ['pending', 'sent', 'delivered', 'failed'] },
      { status: 'sent', sid: 'wamid.1', replaceable: ['pending'] },
      // A failure never replaces proof the message arrived.
      { status: 'failed', sid: 'wamid.2', replaceable: ['pending', 'sent'] },
    ])
  })

  it('a status we do not store is skipped', async () => {
    statuses = [{ messageSid: 'wamid.3', status: 'deleted' }]
    await POST(receipt())
    expect(updates).toEqual([])
  })
})
