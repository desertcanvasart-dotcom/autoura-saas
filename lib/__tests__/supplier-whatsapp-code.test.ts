import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { signInReadiness, whatsAppCodeTemplate, whatsAppSentTo } from '@/lib/supplier-accounts'
import { codeRecipientsForAgency } from '@/lib/supplier-claims'

const read = (p: string) => readFileSync(p, 'utf8')
const SID = 'HXda9fbe8be06291db903fa24d9654d856'

describe('supplier sign-in code by WhatsApp (audit D1)', () => {
  const saved = process.env.TWILIO_SUPPLIER_CODE_CONTENT_SID
  afterEach(() => { process.env.TWILIO_SUPPLIER_CODE_CONTENT_SID = saved })

  it('is on only with a real Content id', () => {
    process.env.TWILIO_SUPPLIER_CODE_CONTENT_SID = ''
    expect(whatsAppCodeTemplate()).toBeNull()
    process.env.TWILIO_SUPPLIER_CODE_CONTENT_SID = 'supplier_sign_in_code'
    expect(whatsAppCodeTemplate()).toBeNull()
    process.env.TWILIO_SUPPLIER_CODE_CONTENT_SID = ` ${SID} `
    expect(whatsAppCodeTemplate()).toBe(SID)
  })

  it('records the number it went to', () => {
    expect(whatsAppSentTo('201099990001')).toBe('whatsapp:+201099990001')
  })

  it('a supplier with no email can sign in once codes go by WhatsApp', () => {
    const rec = { whatsapp: '+201099990001' }
    expect(signInReadiness(rec, 'Egypt').ok).toBe(false)
    expect(signInReadiness(rec, 'Egypt', true)).toEqual({ ok: true, reason: null })
    expect(signInReadiness({}, 'Egypt', true).ok).toBe(false)
  })

  it('the approving agency sees the WhatsApp number, not addresses', () => {
    expect(codeRecipientsForAgency('whatsapp:+201099990001', { email: 'ops@nile.com' }))
      .toEqual({ yours: [], others: 0, whatsapp: '+201099990001' })
    expect(codeRecipientsForAgency('ops@nile.com', { email: 'ops@nile.com' })).toEqual({ yours: ['ops@nile.com'], others: 0 })
  })

  it('the route tries WhatsApp first, falls back to email, and never puts the code in the stored row', () => {
    const code = read('app/api/supplier-auth/code/route.ts')
    expect(code.indexOf('sendWhatsAppTemplate(')).toBeGreaterThan(0)
    expect(code.indexOf('sendWhatsAppTemplate(')).toBeLessThan(code.indexOf('sendMail('))
    expect(code).toContain("update({ channel: 'email', sent_to: emails.join(', ') })")
    expect(code).toContain('variables: { 1: code }')
  })
})
