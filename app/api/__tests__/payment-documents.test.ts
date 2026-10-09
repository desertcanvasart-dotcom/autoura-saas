// The payment, invoice and receipt pages read payment_status; the column is
// `status`, GET /api/payments/[id] passed the row through, and every one of
// them crashed on payment_status.replace(). The receipt also said "Payment
// Completed Successfully" for pending, failed and refunded payments, and its
// WhatsApp button never showed because the client's phone was never fetched.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, sent: [] as unknown[], selects: [] as string[] }))

function client() {
  const b: Record<string, unknown> = {}
  b.select = (cols: string) => { h.selects.push(cols); return b }
  b.eq = () => b
  b.single = async () => ({ data: h.row, error: h.row ? null : { message: 'not found' } })
  return { from: () => b, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }
}

vi.mock('@/lib/supabase-server', () => ({
  createAuthenticatedClient: async () => client(),
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: client() }),
}))
vi.mock('@/lib/sender-tenant', () => ({ loadSenderTenant: async () => ({ company_name: 'Nile Journeys' }) }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: async (m: unknown) => { h.sent.push(m); return { success: true } } }))

import { GET } from '@/app/api/payments/[id]/route'
import { POST as sendReceipt } from '@/app/api/whatsapp/send-receipt/route'

const payment = (status: string) => ({
  id: 'pay-1', status, amount: 500, currency: 'EUR', payment_date: '2026-10-01', transaction_reference: null,
  itineraries: { id: 'it-1', itinerary_code: 'IT-1', client_name: 'Guest', client_phone: '+201000000000', client_email: 'g@example.com', total_cost: 3000 },
})

beforeEach(() => { h.sent.length = 0; h.selects.length = 0 })

describe('GET /api/payments/[id]', () => {
  it('returns payment_status, which every page reads, and the client’s contact', async () => {
    h.row = payment('pending')
    const res = await GET({} as never, { params: Promise.resolve({ id: 'pay-1' }) })
    const { data } = await res.json()
    expect(data.payment_status).toBe('pending')
    expect(data.status).toBe('pending')
    expect(data.client_phone).toBe('+201000000000')
    expect(data.client_email).toBe('g@example.com')
  })
})

describe('receipts are for money received', () => {
  const req = () => new Request('http://x', { method: 'POST', body: JSON.stringify({ paymentId: 'pay-1' }) })

  it.each(['pending', 'failed', 'refunded'])('sends no receipt for a %s payment', async (status) => {
    h.row = payment(status)
    const res = await sendReceipt(req() as never)
    expect(res.status).toBe(409)
    expect(h.sent).toHaveLength(0)
  })

  it('still sends one for a completed payment', async () => {
    h.row = payment('completed')
    const res = await sendReceipt(req() as never)
    expect(res.status).toBe(200)
    expect(h.sent).toHaveLength(1)
  })

  it('the receipt page offers no PDF or WhatsApp, and says so, unless the payment is completed', () => {
    const page = readFileSync(join(process.cwd(), 'app/documents/receipt/[id]/page.tsx'), 'utf8')
    expect(page).toContain("const received = payment.payment_status === 'completed'")
    expect(page).toContain('{received && payment.client_phone && (')
    expect(page).toContain('{received && (')
    expect(page).toContain('not received, so there is no receipt to issue')
  })

  it('the payment page links a receipt only for a completed payment, and the receipts list only those', () => {
    const detail = readFileSync(join(process.cwd(), 'app/payments/[id]/page.tsx'), 'utf8')
    expect(detail).toMatch(/payment\.payment_status === 'completed' && \(\s*<Link\s+href=\{`\/documents\/receipt\//)
    const list = readFileSync(join(process.cwd(), 'app/receipts/page.tsx'), 'utf8')
    expect(list).toContain("itineraryPayments.filter((p: any) => p.status === 'completed')")
  })
})
