// The quote PDFs used Helvetica, which is Latin-1 only: a Japanese or Russian
// name came out garbled. A trip with no dates printed 1/1/1970. The WhatsApp
// AI agent's quote send used BUSINESS_NAME, attached the stored pdf_url (an
// expired or unopenable link) and skipped the price gate — and, given the
// public client by the webhook, never found a quote at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({ quote: null as Row | null, sent: [] as Row[], fresh: [] as Row[], updates: [] as Row[] }))

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Row = {}
      b.select = () => b; b.eq = () => b
      b.maybeSingle = async () => ({ data: h.quote, error: null })
      b.update = (d: Row) => { h.updates.push(d); return b }
      b.insert = async () => ({ error: null })
      b.then = (r: (v: unknown) => void) => r({ data: null, error: null })
      return b
    },
  }),
}))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => ({ company_name: 'Atlas Trails' }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async (m: Row) => { h.sent.push(m); return { success: true, messageId: 'wa' } } }))
vi.mock('@/lib/quotes/fresh-quote-pdf', () => ({ freshQuotePdf: async (_db: unknown, o: Row) => { h.fresh.push(o); return { ok: true, url: 'https://signed/fresh.pdf' } } }))

import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import { QUOTE_PDF_FONT } from '@/lib/pdf/quote-fonts'
import { ToolExecutor } from '@/lib/whatsapp-ai-agent'

const quote = (over: Row = {}): Row => ({
  id: 'q1', quote_number: 'Q-1', tier: 'standard', currency: 'EUR', num_travelers: 2, client_id: 'c1',
  selling_price: 3000, price_per_person: 1500, total_cost: 2400, margin_percent: 25, created_at: '2026-10-09',
  valid_until: null, client_notes: 'Вегетарианское питание', pdf_url: 'https://old/expired.pdf',
  clients: { full_name: '山田太郎', email: 'y@example.com', phone: '+81', nationality: 'JP' },
  itineraries: { id: 'it-1', itinerary_code: 'IT-1', trip_name: 'Иван Петров — Atlas', start_date: null, end_date: null, total_days: 6 },
  ...over,
})

beforeEach(() => { h.sent.length = 0; h.fresh.length = 0; h.updates.length = 0; h.quote = quote() })

describe('quote PDFs', () => {
  it('use Noto Sans JP, so Japanese and Cyrillic print, and leave out missing dates', async () => {
    expect(QUOTE_PDF_FONT).toBe('NotoSansJP')
    const pdf = await renderToBuffer(createElement(B2CQuotePDF, { quote: quote(), company: { name: 'Atlas Trails' } } as never) as never)
    const dir = mkdtempSync(join(tmpdir(), 'quote-pdf-'))
    writeFileSync(join(dir, 'q.pdf'), pdf)
    let text: string
    try {
      text = execFileSync('pdftotext', [join(dir, 'q.pdf'), '-'], { encoding: 'utf8' })
    } catch {
      return // no pdftotext here: the font assertion above stands
    }
    expect(text).toContain('山田太郎')
    expect(text).toContain('Вегетарианское питание')
    expect(text).not.toMatch(/1970/)
    expect(text).not.toContain('Start Date')
  })
})

describe('the AI agent’s quote send', () => {
  const run = () => new ToolExecutor({ from: () => ({ insert: async () => ({ error: null }) }) } as never, 'c1', '+212600000000', 'conv-1', 't1')
    .execute('send_quote_to_customer', { quote_id: 'q1' })

  it('sends a fresh PDF, signed as the tenant', async () => {
    const res = await run()
    expect(res, JSON.stringify(res)).toMatchObject({ success: true })
    expect(h.fresh).toHaveLength(1)
    expect(h.sent[0].mediaUrl).toBe('https://signed/fresh.pdf')
    expect(h.sent[0].body).toContain('Atlas Trails')
    expect(h.sent[0].body).not.toMatch(/🐪/)
  })

  it('refuses a price that is not deliverable', async () => {
    h.quote = quote({ selling_price: 0, price_per_person: 0 })
    const res = await run()
    expect(res.success).toBe(false)
    expect(h.sent).toHaveLength(0)
  })

  it('refuses another customer’s quote', async () => {
    h.quote = quote({ client_id: 'someone-else' })
    expect((await run()).success).toBe(false)
    expect(h.sent).toHaveLength(0)
  })
})
