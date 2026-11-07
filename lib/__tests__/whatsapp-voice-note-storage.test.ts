// Which stored WhatsApp media a message row may have signed, and which Twilio
// links the server may fetch with the account's credentials (2026-11-07).
import { describe, it, expect } from 'vitest'
import { outboundVoicePath, storagePathBelongsTo, isOwnTwilioMediaUrl } from '@/lib/whatsapp/voice-note-storage'

const T = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-2222-3333-4444-555555555555'

describe('stored media paths', () => {
  it('a voice note is filed under its tenant', () => {
    expect(outboundVoicePath(T, 'abc-123')).toBe(`outbound/${T}/abc-123.ogg`)
    expect(outboundVoicePath(T, '../../x')).toBe(`outbound/${T}/______x.ogg`)
  })

  it('a row may sign its own inbound file or a voice note of its own tenant', () => {
    expect(storagePathBelongsTo('inbound/SM123.ogg', { message_sid: 'SM123', tenant_id: T })).toBe(true)
    expect(storagePathBelongsTo(`outbound/${T}/abc.ogg`, { message_sid: 'SMx', tenant_id: T })).toBe(true)
  })

  it('never another message’s or another company’s file', () => {
    expect(storagePathBelongsTo('inbound/SM999.ogg', { message_sid: 'SM123', tenant_id: T })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${OTHER}/abc.ogg`, { message_sid: 'SM123', tenant_id: T })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${T}/../${OTHER}/abc.ogg`, { message_sid: 'SM123', tenant_id: T })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${T}/abc.pdf`, { message_sid: 'SM123', tenant_id: T })).toBe(false)
    expect(storagePathBelongsTo('inbound/.ogg', { message_sid: null, tenant_id: T })).toBe(false)
  })
})

describe('Twilio media links the server may fetch', () => {
  const SID = 'AC' + 'a'.repeat(32)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/MM${'b'.repeat(32)}/Media/ME${'c'.repeat(32)}`
  it('our own account’s media', () => {
    expect(isOwnTwilioMediaUrl(url, SID)).toBe(true)
  })
  it('not another account, another host, plain http, or any other path', () => {
    expect(isOwnTwilioMediaUrl(url.replace(SID, 'AC' + 'd'.repeat(32)), SID)).toBe(false)
    expect(isOwnTwilioMediaUrl(url.replace('api.twilio.com', 'evil.example'), SID)).toBe(false)
    expect(isOwnTwilioMediaUrl(url.replace('https:', 'http:'), SID)).toBe(false)
    expect(isOwnTwilioMediaUrl(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, SID)).toBe(false)
    expect(isOwnTwilioMediaUrl(url, undefined)).toBe(false)
    expect(isOwnTwilioMediaUrl(null, SID)).toBe(false)
  })
})
