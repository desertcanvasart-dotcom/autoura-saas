import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { NO_COUNTRY_WARNING, whatsappRecipient } from '@/lib/communication-utils'
import { signInReadiness } from '@/lib/supplier-accounts'

describe('WhatsApp never opens a chat with a number missing its country code', () => {
  it('a local number with no agency country → no recipient, and the warning', () => {
    expect(whatsappRecipient('01112405969', null)).toEqual({ phone: null, warning: NO_COUNTRY_WARNING })
  })
  it('with the country, or already international → the number', () => {
    expect(whatsappRecipient('01112405969', 'Egypt')).toEqual({ phone: '201112405969', warning: null })
    expect(whatsappRecipient('+20 111 240 5969', null)).toEqual({ phone: '201112405969', warning: null })
  })
  it('no number → nothing, no warning', () => {
    expect(whatsappRecipient(null, null)).toEqual({ phone: null, warning: null })
  })
  it('the request, the client message and the supplier page link all use it and pass the warning on', () => {
    for (const f of ['app/api/bookings/[id]/suppliers/[lineId]/request/route.ts', 'app/api/bookings/[id]/client-day-message/route.ts', 'app/api/suppliers/[id]/portal-link/route.ts']) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).toContain('whatsappRecipient(')
      expect(s, f).toContain('phone_warning')
      expect(s, f).not.toContain('formatPhoneForWhatsApp(')
    }
    for (const f of ['components/booking/RequestOnWhatsApp.tsx', 'components/booking/ClientDayMessage.tsx', 'components/SupplierPageLink.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('phone_warning')
    }
  })
})

describe('the supplier card says whether they can sign in', () => {
  it('needs a phone, an email, and a number that reads as international', () => {
    expect(signInReadiness({ phone: '01112405969', email: 'a@b.eg' }, 'Egypt')).toEqual({ ok: true, reason: null })
    expect(signInReadiness({ phone: '01112405969' }, 'Egypt').reason).toMatch(/No email/)
    expect(signInReadiness({ email: 'a@b.eg' }, 'Egypt').reason).toMatch(/No phone/)
    expect(signInReadiness({ phone: '01112405969', email: 'a@b.eg' }, null).reason).toMatch(/Settings → Company/)
    expect(signInReadiness({ whatsapp: '+201112405969', email: 'a@b.eg' }, null).ok).toBe(true)
  })
})
