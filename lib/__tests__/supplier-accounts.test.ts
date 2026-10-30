import { describe, it, expect } from 'vitest'
import {
  CODE_MAX_ATTEMPTS, canSendCode, checkLoginCode, codeEmails, codeExpiry, generateLoginCode, generateSessionToken,
  hashLoginCode, hashSessionToken, isSessionLive, maskEmail, normalizeLoginPhone, phoneTail, recordMatchesPhone, sessionExpiry,
} from '@/lib/supplier-accounts'

const now = new Date('2026-11-05T10:00:00Z')

describe('the phone a supplier signs in with', () => {
  it('needs the country code; becomes international digits', () => {
    expect(normalizeLoginPhone('+20 100 123 4567')).toEqual({ ok: true, phone: '201001234567' })
    expect(normalizeLoginPhone('0020-100-123-4567')).toEqual({ ok: true, phone: '201001234567' })
    for (const bad of ['0100 123 4567', '100', '+20abc', '', null]) expect(normalizeLoginPhone(bad).ok, String(bad)).toBe(false)
  })

  it("matches an agency's record written locally, with that agency's country, on any of its numbers", () => {
    expect(recordMatchesPhone({ phone: '0100 123 4567' }, 'Egypt', '201001234567')).toBe(true)
    expect(recordMatchesPhone({ whatsapp: '+20 100 123 4567' }, null, '201001234567')).toBe(true)
    expect(recordMatchesPhone({ contact_phone: '0100 123 4567' }, null, '201001234567')).toBe(false) // country unknown: no guess
    expect(recordMatchesPhone({ phone: '0100 123 4568' }, 'Egypt', '201001234567')).toBe(false)
    expect(phoneTail('201001234567')).toBe('001234567')
  })
})

describe('the one-time code', () => {
  const row = (over = {}) => ({ code_hash: hashLoginCode('123456', 'acc1'), expires_at: codeExpiry(now), attempts: 0, used_at: null, ...over })

  it('is 6 digits, lives 10 minutes, and is stored only as a hash bound to the account', () => {
    expect(generateLoginCode()).toMatch(/^[0-9]{6}$/)
    expect(codeExpiry(now)).toBe('2026-11-05T10:10:00.000Z')
    expect(hashLoginCode('123456', 'acc1')).not.toContain('123456')
    expect(hashLoginCode('123456', 'acc1')).not.toBe(hashLoginCode('123456', 'acc2'))
  })

  it('right code passes; wrong one counts a try; expired, used or exhausted never pass', () => {
    expect(checkLoginCode(row(), '123 456', 'acc1', now)).toEqual({ ok: true })
    expect(checkLoginCode(row(), '654321', 'acc1', now)).toMatchObject({ ok: false, spend: true })
    expect(checkLoginCode(row(), '123456', 'acc2', now)).toMatchObject({ ok: false, spend: true })
    expect(checkLoginCode(row({ expires_at: '2026-11-05T09:59:00Z' }), '123456', 'acc1', now)).toMatchObject({ ok: false, spend: false })
    expect(checkLoginCode(row({ used_at: '2026-11-05T09:58:00Z' }), '123456', 'acc1', now)).toMatchObject({ ok: false })
    expect(checkLoginCode(row({ attempts: CODE_MAX_ATTEMPTS }), '123456', 'acc1', now)).toMatchObject({ ok: false, error: 'Too many tries — ask for a new code' })
    expect(checkLoginCode(null, '123456', 'acc1', now)).toMatchObject({ ok: false })
    expect(checkLoginCode(row(), '12345', 'acc1', now)).toMatchObject({ ok: false, spend: false })
  })

  it('at most 3 sends in 15 minutes', () => {
    const t = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
    expect(canSendCode([t(1), t(5)], now)).toBe(true)
    expect(canSendCode([t(1), t(5), t(14)], now)).toBe(false)
    expect(canSendCode([t(1), t(5), t(16)], now)).toBe(true)
  })

  it('goes to the emails on the matched records, shown masked', () => {
    expect(codeEmails([{ email: 'Ahmed@Cars.eg', contact_email: 'ahmed@cars.eg' }, { email: 'bad' }, { contact_email: 'ops@nile.com' }]))
      .toEqual(['ahmed@cars.eg', 'ops@nile.com'])
    expect(maskEmail('ahmed@cars.eg')).toBe('a•••@cars.eg')
  })
})

describe('the session', () => {
  it('a long random token, stored as a hash, 30 days, revocable', () => {
    const tok = generateSessionToken()
    expect(tok.length).toBeGreaterThanOrEqual(43)
    expect(hashSessionToken(tok)).not.toContain(tok)
    expect(sessionExpiry(now)).toBe('2026-12-05T10:00:00.000Z')
    expect(isSessionLive({ expires_at: sessionExpiry(now), revoked_at: null }, now)).toBe(true)
    expect(isSessionLive({ expires_at: sessionExpiry(now), revoked_at: '2026-11-05T10:00:00Z' }, now)).toBe(false)
    expect(isSessionLive({ expires_at: '2026-11-05T09:00:00Z', revoked_at: null }, now)).toBe(false)
    expect(isSessionLive(null, now)).toBe(false)
  })
})
