import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsPDF } from 'jspdf'
import { needsUnicodeFont, applyDocumentFont } from '@/lib/pdf/jspdf-font'
import { serverPdfFontFor } from '@/lib/pdf/jspdf-font-server'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { encodeEmailHeader, attachmentNameParams } from '@/lib/email/mime-header'
import { contractPrice } from '@/lib/contract-terms'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('needsUnicodeFont', () => {
  it('is false for what Helvetica draws (Latin-1 and the WinAnsi extras)', () => {
    expect(needsUnicodeFont({ name: 'José Müller', note: 'USD 100 — “ok” … ™' })).toBe(false)
  })
  it('is true for Japanese, Cyrillic or Greek', () => {
    expect(needsUnicodeFont({ name: '山田 太郎' })).toBe(true)
    expect(needsUnicodeFont('Иван')).toBe(true)
    expect(needsUnicodeFont('Ελένη')).toBe(true)
  })
})

describe('jsPDF documents in Noto Sans JP', () => {
  it('a Latin document gets no font (and stays small)', async () => {
    expect(await serverPdfFontFor({ client_name: 'John Smith' })).toBeNull()
  })

  it('routes the generators\' Helvetica to the embedded font', async () => {
    const font = await serverPdfFontFor('山田')
    expect(font).not.toBeNull()
    const doc = new jsPDF()
    expect(applyDocumentFont(doc, font)).toBe('NotoSansJP')
    doc.setFont('helvetica', 'bold')
    expect(doc.getFont().fontName).toBe('NotoSansJP')
    expect(doc.getFont().fontStyle).toBe('bold')
    doc.setFont('helvetica', 'italic') // no italic face: upright, never a throw
    expect(doc.getFont().fontStyle).toBe('normal')
  })

  it('renders a Japanese client name on an invoice', async () => {
    const invoice = {
      id: 'i1', invoice_number: 'INV-1', invoice_type: 'standard', client_name: '山田 太郎', client_email: '',
      line_items: [{ description: 'ツアー', quantity: 1, unit_price: 120000, amount: 120000 }],
      subtotal: 120000, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 120000, currency: 'JPY',
      amount_paid: 0, balance_due: 120000, status: 'sent', issue_date: '2026-10-09', due_date: '2026-10-20',
      notes: null, payment_terms: null, payment_instructions: null,
    }
    const font = await serverPdfFontFor(invoice)
    const pdf = generateInvoicePDF(invoice as never, { name: 'ATS' }, font)
    const out = pdf.output()
    expect(out).toContain('/NotoSansJP')
  })
})

describe('MIME headers on Gmail sends', () => {
  it('leaves ASCII alone and encodes the rest (RFC 2047)', () => {
    expect(encodeEmailHeader('Hotel voucher')).toBe('Hotel voucher')
    const enc = encodeEmailHeader('バウチャー 山田様')
    expect(enc).toMatch(/^=\?UTF-8\?B\?/)
    const decoded = enc.split(' ').map(w => Buffer.from(w.slice(10, -2), 'base64').toString('utf8')).join('')
    expect(decoded).toBe('バウチャー 山田様')
  })
  it('strips CR/LF (no header injection)', () => {
    expect(encodeEmailHeader('a\r\nBcc: x@y')).toBe('a Bcc: x@y')
  })
  it('gives a non-ASCII attachment an ASCII name plus filename*', () => {
    expect(attachmentNameParams('voucher.pdf').disposition).toBe('filename="voucher.pdf"')
    const p = attachmentNameParams('山田.pdf')
    expect(p.disposition).toContain('filename="__.pdf"')
    expect(p.disposition).toContain("filename*=UTF-8''%E5%B1%B1%E7%94%B0.pdf")
  })
})

describe('money on client documents', () => {
  it('the contract price in its currency', () => {
    expect(contractPrice(1234.5, 'USD')).toBe('$1,234.50')
    expect(contractPrice(450000, 'JPY')).toBe('JPY 450,000')
    expect(contractPrice(null, 'EUR')).toBe('To be confirmed')
  })
  it('reminders and the booking confirmation use formatMoney', () => {
    for (const f of ['app/api/invoices/[id]/reminder/route.ts', 'app/api/invoices/reminders/route.ts', 'app/api/cron/send-reminders/route.ts', 'lib/bookings/confirmation-message.ts']) {
      expect(src(f), f).not.toMatch(/toFixed\(2\)\}`/)
      expect(src(f), f).toContain('formatMoney(')
    }
  })
})

describe('client-facing identity', () => {
  it('no Travel2Egypt review link on the thank-you', () => {
    expect(src('app/api/whatsapp/send-thankyou/route.ts')).not.toContain('g.page/r/travel2egypt')
  })
  it('the AI agent no longer speaks for one env-configured operator in Egypt', () => {
    const agent = src('lib/whatsapp-ai-agent.ts')
    expect(agent).not.toContain("process.env.BUSINESS_NAME")
    expect(agent).not.toContain("timeZone: 'Africa/Cairo'")
  })
  it('the portal traveller email escapes what visitors typed', () => {
    expect(src('lib/booking-portal.ts')).toContain('escapeHtml(firstName)')
  })
})
