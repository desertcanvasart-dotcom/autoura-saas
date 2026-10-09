/* eslint-disable @typescript-eslint/no-explicit-any */
// The supplier-voucher send routes took recipient, names and PDF from the body
// and checked no document: a "send any PDF to any address" endpoint for any
// signed-in user. Email also Bcc'd every tenant's vouchers to the platform's
// GMAIL_USER, claimed that address as From, and put names into HTML unescaped.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  // What supplier_documents returns to the caller's RLS-scoped client, and
  // the updates it receives (the route marking the voucher sent).
  const state = { ownDocument: null as null | Record<string, unknown>, updates: [] as Record<string, unknown>[] }
  const rlsClient = {
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: state.ownDocument, error: null }),
        update: (u: Record<string, unknown>) => { state.updates.push(u); return b },
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  }
  const adminClient = {
    from: () => {
      const b: any = { select: () => b, eq: () => b, single: async () => ({ data: { access_token: 'a', refresh_token: 'r', user_id: 'u1' } }) }
      return b
    },
  }
  return {
    state,
    rlsClient,
    adminClient,
    gmailSend: vi.fn(async () => ({ data: { id: 'msg-1' } })),
    whatsapp: vi.fn(async () => ({ success: true, messageId: 'wa-1' })),
  }
})

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: h.rlsClient }),
  createAdminClient: () => h.adminClient,
}))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => ({ company_name: 'Nile & Co', contact_email: 'ops@nile.example' }) }))
vi.mock('@/lib/gmail', () => ({
  getGmailClient: () => ({ users: { messages: { send: (args: unknown) => (h.gmailSend as any)(args) } } }),
  refreshAccessToken: async () => ({ access_token: 'a2' }),
}))
vi.mock('@/lib/storage/shareable-pdf', () => ({ uploadShareablePdf: async () => ({ ok: true, url: 'https://signed' }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: (args: unknown) => (h.whatsapp as any)(args) }))

import { POST as sendEmail } from '@/app/api/send-supplier-document/route'
import { POST as sendWhatsApp } from '@/app/api/whatsapp/send-supplier-document/route'

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any
const email = { documentId: 'doc-1', supplierEmail: 'hotel@example.com', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }
const wa = { documentId: 'doc-1', supplierPhone: '+201000000000', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }

// The voucher row: the recipient, number and names come from here.
const row = {
  id: 'doc-1', status: 'draft', document_type: 'hotel_voucher', document_number: 'HV-1',
  supplier_name: '<b>Hotel</b>', supplier_contact_name: 'Front desk', supplier_contact_email: 'hotel@example.com',
  supplier_contact_phone: '+201000000000', client_name: 'Guest',
}

function sentEmail() {
  const raw = Buffer.from((h.gmailSend.mock.calls[0] as any[])[0].requestBody.raw, 'base64url').toString()
  const headers = raw.split('\r\n\r\n')[0]
  const htmlPart = raw.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0]
  return { headers, html: Buffer.from(htmlPart, 'base64').toString() }
}

beforeEach(() => {
  h.state.ownDocument = null
  h.state.updates.length = 0
  h.gmailSend.mockClear()
  h.whatsapp.mockClear()
  process.env.GMAIL_USER = 'platform@autoura.example'
})

describe('sending a supplier voucher', () => {
  it('refuses a voucher the caller’s tenant cannot see, or none at all', async () => {
    expect((await sendEmail(req(email))).status).toBe(404)
    expect((await sendEmail(req({ ...email, documentId: undefined }))).status).toBe(404)
    expect((await sendWhatsApp(req(wa))).status).toBe(404)
    expect(h.gmailSend).not.toHaveBeenCalled()
    expect(h.whatsapp).not.toHaveBeenCalled()
  })

  it('emails with no From or Bcc naming the platform address, names escaped', async () => {
    h.state.ownDocument = row
    const res = await sendEmail(req(email))
    expect(res.status).toBe(200)
    const { headers, html } = sentEmail()
    expect(headers).not.toMatch(/^Bcc:/m)
    expect(headers).not.toMatch(/^From:/m)
    expect(raw()).not.toContain('platform@autoura.example')
    expect(html).toContain('&lt;b&gt;Hotel&lt;/b&gt;')
    expect(html).toContain('Nile &amp; Co | ops@nile.example')
  })

  it('sends to the voucher’s supplier, never an address the request names', async () => {
    h.state.ownDocument = row
    await sendEmail(req({ ...email, supplierEmail: 'attacker@evil.test' }))
    expect(raw()).toMatch(/^To: hotel@example\.com$/m)
    expect(raw()).not.toContain('attacker@evil.test')
  })

  it('marks the voucher sent itself once the email has gone', async () => {
    h.state.ownDocument = row
    await sendEmail(req(email))
    expect(h.state.updates.at(-1)).toMatchObject({ status: 'sent' })
    expect(typeof h.state.updates.at(-1)!.sent_at).toBe('string')
  })

  it('sends the tenant’s own voucher by WhatsApp to the voucher’s number, and marks it sent', async () => {
    h.state.ownDocument = row
    expect((await sendWhatsApp(req({ ...wa, supplierPhone: '+19999999999' }))).status).toBe(200)
    expect(h.whatsapp).toHaveBeenCalledOnce()
    expect((h.whatsapp.mock.calls[0] as any[])[0].to).toBe('+201000000000')
    expect(h.state.updates.at(-1)).toMatchObject({ status: 'sent' })
  })
})

function raw() {
  return Buffer.from((h.gmailSend.mock.calls[0] as any[])[0].requestBody.raw, 'base64url').toString()
    + Buffer.from(sentEmail().html).toString()
}
