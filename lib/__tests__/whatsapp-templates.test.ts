import { describe, it, expect } from 'vitest'
import {
  fillTemplate,
  isContentSid,
  readFollowUpTemplates,
  templateVariables,
  windowState,
  withFollowUpTemplates,
} from '../whatsapp-templates'

const SID = 'HX0123456789abcdef0123456789abcdef'

describe("WhatsApp's 24-hour window", () => {
  const now = new Date('2026-11-19T12:00:00Z')

  it('is open within 24 hours of the client’s last message', () => {
    const w = windowState('2026-11-19T01:00:00Z', now)
    expect(w.open).toBe(true)
    expect(w.closesAt).toBe('2026-11-20T01:00:00.000Z')
  })

  it('is closed after 24 hours: the 2685 case, last message 11 Nov, sends on 19 Nov', () => {
    expect(windowState('2026-11-11T10:00:32Z', now).open).toBe(false)
  })

  it('closes at exactly 24 hours', () => {
    expect(windowState('2026-11-18T12:00:00Z', now).open).toBe(false)
    expect(windowState('2026-11-18T12:00:01Z', now).open).toBe(true)
  })

  it('was never open for a client who never wrote', () => {
    expect(windowState(null, now)).toEqual({ open: false, lastInboundAt: null, closesAt: null })
    expect(windowState('not a date', now).open).toBe(false)
  })
})

describe('follow-up templates in the company settings', () => {
  it('reads only well-formed entries, per language', () => {
    const t = readFollowUpTemplates({
      whatsapp_templates: {
        follow_up: {
          en: { contentSid: SID, body: 'Hello from Travel2Egypt.' },
          es: { contentSid: 'not-a-sid', body: 'Hola' },
          ja: { contentSid: SID, body: '   ' },
          fr: { contentSid: SID, body: 'Bonjour' },
        },
      },
    })
    expect(Object.keys(t)).toEqual(['en'])
  })

  it('reads nothing from empty or odd settings', () => {
    expect(readFollowUpTemplates(null)).toEqual({})
    expect(readFollowUpTemplates({})).toEqual({})
    expect(readFollowUpTemplates({ whatsapp_templates: { follow_up: [] } })).toEqual({})
  })

  it('writing keeps every other setting', () => {
    const next = withFollowUpTemplates(
      { theme: 'teal', whatsapp_templates: { other: 1, follow_up: { en: { contentSid: SID, body: 'x' } } } },
      { es: { contentSid: SID, body: 'Hola' } },
    )
    expect(next).toEqual({ theme: 'teal', whatsapp_templates: { other: 1, follow_up: { es: { contentSid: SID, body: 'Hola' } } } })
  })

  it('recognises a Twilio template ID', () => {
    expect(isContentSid(SID)).toBe(true)
    expect(isContentSid(' ' + SID + ' ')).toBe(true)
    expect(isContentSid('HX123')).toBe(false)
    expect(isContentSid('MM0123456789abcdef0123456789abcdef')).toBe(false)
  })
})

describe('template variables', () => {
  it('a template without variables sends none', () => {
    expect(templateVariables('Hello from Travel2Egypt.', {})).toEqual({})
  })

  it('{{1}} is the client’s first name', () => {
    const v = templateVariables('Hello {{1}}, this is Travel2Egypt.', { clientFirstName: 'Maria' })
    expect(v).toEqual({ '1': 'Maria' })
    expect(fillTemplate('Hello {{1}}, this is Travel2Egypt.', v!)).toBe('Hello Maria, this is Travel2Egypt.')
  })

  it('refuses when a variable has no value (WhatsApp rejects an empty one)', () => {
    expect(templateVariables('Hello {{1}}', { clientFirstName: '' })).toBeNull()
    expect(templateVariables('Hello {{1}}, from {{2}}', { clientFirstName: 'Maria' })).toBeNull()
  })
})
