/* eslint-disable @typescript-eslint/no-explicit-any */
// The supplier-voucher send routes took recipient, names and PDF from the body
// and checked no document: a "send any PDF to any address" endpoint for any
// signed-in user. Email also Bcc'd every tenant's vouchers to the platform's
// GMAIL_USER, claimed that address as From, and put names into HTML unescaped.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  // What supplier_documents returns to the caller's RLS-scoped client.
  const state = { ownDocument: null as null | { id: string } }
  const rlsClient = {
    from: () => {
      const b: any = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: state.ownDocument, error: null }) }
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
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: () => h.whatsapp() }))

import { POST as sendEmail } from '@/app/api/send-supplier-document/route'
import { POST as sendWhatsApp } from '@/app/api/whatsapp/send-supplier-document/route'

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any
const email = { documentId: 'doc-1', supplierEmail: 'hotel@example.com', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }
const wa = { documentId: 'doc-1', supplierPhone: '+201000000000', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }

function sentEmail() {
  const raw = Buffer.from((h.gmailSend.mock.calls[0] as any[])[0].requestBody.raw, 'base64url').toString()
  const headers = raw.split('\r\n\r\n')[0]
  const htmlPart = raw.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0]
  return { headers, html: Buffer.from(htmlPart, 'base64').toString() }
}

beforeEach(() => {
  h.state.ownDocument = null
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
    h.state.ownDocument = { id: 'doc-1' }
    const res = await sendEmail(req({ ...email, supplierName: '<b>Hotel</b>' }))
    expect(res.status).toBe(200)
    const { headers, html } = sentEmail()
    expect(headers).not.toMatch(/^Bcc:/m)
    expect(headers).not.toMatch(/^From:/m)
    expect(raw()).not.toContain('platform@autoura.example')
    expect(html).toContain('&lt;b&gt;Hotel&lt;/b&gt;')
    expect(html).toContain('Nile &amp; Co | ops@nile.example')
  })

  it('sends the tenant’s own voucher by WhatsApp', async () => {
    h.state.ownDocument = { id: 'doc-1' }
    expect((await sendWhatsApp(req(wa))).status).toBe(200)
    expect(h.whatsapp).toHaveBeenCalledOnce()
  })
})

function raw() {
  return Buffer.from((h.gmailSend.mock.calls[0] as any[])[0].requestBody.raw, 'base64url').toString()
    + Buffer.from(sentEmail().html).toString()
}
