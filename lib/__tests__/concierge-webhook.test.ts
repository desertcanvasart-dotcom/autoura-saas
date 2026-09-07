import { describe, it, expect } from 'vitest'
import {
  signConciergePayload,
  buildSignatureHeader,
  parseSignatureHeader,
  verifyConciergeSignature,
} from '@/lib/concierge-webhook-auth'
import {
  validateBrief,
  mapBrief,
  mapComfortLevelToTier,
  mapLanguageToLabel,
  splitName,
  buildSpecialNeeds,
} from '@/lib/concierge-brief-schema'

const CURRENT = [{ label: 'current' as const, secret: 'secret_current' }]
const DUAL = [
  { label: 'current' as const, secret: 'secret_current' },
  { label: 'previous' as const, secret: 'secret_previous' },
]
const NOW = 1_750_000_000

function sigHeader(secret: string, t: number, body: string) {
  return buildSignatureHeader(secret, t, body)
}

// ============================================
// HMAC signature
// ============================================
describe('concierge HMAC signature', () => {
  const body = '{"conversation_id":"abc","brief_revision":1}'

  it('verifies a correctly signed request', () => {
    const r = verifyConciergeSignature({
      rawBody: body,
      signatureHeader: sigHeader('secret_current', NOW, body),
      timestampHeader: String(NOW),
      secrets: CURRENT,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.secretUsed).toBe('current')
  })

  it('accepts the previous secret during rotation overlap', () => {
    const r = verifyConciergeSignature({
      rawBody: body,
      signatureHeader: sigHeader('secret_previous', NOW, body),
      timestampHeader: String(NOW),
      secrets: DUAL,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.secretUsed).toBe('previous')
  })

  it('rejects a tampered body', () => {
    const r = verifyConciergeSignature({
      rawBody: body + ' ',
      signatureHeader: sigHeader('secret_current', NOW, body),
      secrets: CURRENT,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('signature_mismatch')
  })

  it('rejects a wrong secret', () => {
    const r = verifyConciergeSignature({
      rawBody: body,
      signatureHeader: sigHeader('not_the_secret', NOW, body),
      secrets: CURRENT,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('signature_mismatch')
  })

  it('rejects an expired timestamp (replay protection)', () => {
    const r = verifyConciergeSignature({
      rawBody: body,
      signatureHeader: sigHeader('secret_current', NOW - 1000, body),
      secrets: CURRENT,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('timestamp_expired')
  })

  it('rejects when companion timestamp disagrees with t', () => {
    const r = verifyConciergeSignature({
      rawBody: body,
      signatureHeader: sigHeader('secret_current', NOW, body),
      timestampHeader: String(NOW + 5),
      secrets: CURRENT,
      nowSeconds: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('timestamp_mismatch')
  })

  it('rejects a missing signature header', () => {
    const r = verifyConciergeSignature({ rawBody: body, signatureHeader: null, secrets: CURRENT, nowSeconds: NOW })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('missing_signature')
  })

  it('rejects a malformed signature header', () => {
    const r = verifyConciergeSignature({ rawBody: body, signatureHeader: 'garbage', secrets: CURRENT, nowSeconds: NOW })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['malformed_signature', 'missing_signature']).toContain(r.code)
  })

  it('reports server misconfig when no secret is set', () => {
    const r = verifyConciergeSignature({ rawBody: body, signatureHeader: sigHeader('x', NOW, body), secrets: [], nowSeconds: NOW })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('no_secret_configured')
  })

  it('parses the t=,v1= header', () => {
    expect(parseSignatureHeader('t=123,v1=deadbeef')).toEqual({ t: '123', v1: 'deadbeef' })
  })

  it('matches the published GET test vector', () => {
    const expected = signConciergePayload(
      'whsec_test_concierge_autoura',
      1735732800,
      '{"conversation_id":"test-conversation","brief_revision":1}'
    )
    expect(expected).toBe('3cc2e7aba5b04ecf03020484f1befcdb128b1cb83f38030550591b159334db5a')
  })
})

// ============================================
// validation
// ============================================
describe('validateBrief', () => {
  it('accepts a minimal valid brief', () => {
    const r = validateBrief({ conversation_id: 'abc' })
    expect(r.ok).toBe(true)
  })

  it('rejects a missing conversation_id (422-worthy)', () => {
    const r = validateBrief({ visitor: { email: 'a@b.com' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].field).toBe('conversation_id')
  })

  it('rejects brief_revision < 1', () => {
    const r = validateBrief({ conversation_id: 'abc', brief_revision: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].field).toBe('brief_revision')
  })

  it('does NOT reject a brief with no contact (accepted + flagged downstream)', () => {
    const r = validateBrief({ conversation_id: 'abc', visitor: { name: 'Anon' } })
    expect(r.ok).toBe(true)
  })

  it('rejects a non-object payload', () => {
    expect(validateBrief('nope').ok).toBe(false)
    expect(validateBrief([]).ok).toBe(false)
  })

  it('accepts a brief with a brand key', () => {
    const r = validateBrief({ conversation_id: 'abc', brand: 'Travel2Egypt' })
    expect(r.ok).toBe(true)
  })

  it('rejects a non-string or empty brand', () => {
    const r1 = validateBrief({ conversation_id: 'abc', brand: 42 })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.errors[0].field).toBe('brand')
    const r2 = validateBrief({ conversation_id: 'abc', brand: '   ' })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errors[0].field).toBe('brand')
  })

  it('rejects a brand longer than 64 characters', () => {
    const r = validateBrief({ conversation_id: 'abc', brand: 'x'.repeat(65) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].field).toBe('brand')
  })
})

// ============================================
// mapping
// ============================================
describe('mapBrief', () => {
  it('splits a full name', () => {
    expect(splitName('Jane Doe')).toEqual({ first_name: 'Jane', last_name: 'Doe' })
    expect(splitName('Cher')).toEqual({ first_name: 'Cher', last_name: 'Cher' })
    expect(splitName('')).toEqual({ first_name: 'Concierge', last_name: 'Lead' })
  })

  it('maps comfort_level to preferred_tier (provisional)', () => {
    expect(mapComfortLevelToTier('luxury')).toBe('luxury')
    expect(mapComfortLevelToTier('comfort')).toBe('deluxe')
    expect(mapComfortLevelToTier('standard')).toBe('standard')
    expect(mapComfortLevelToTier('budget')).toBe('budget')
    expect(mapComfortLevelToTier('boutique 5-star')).toBe('luxury')
    expect(mapComfortLevelToTier(undefined)).toBe('standard')
  })

  it('maps language code to label', () => {
    expect(mapLanguageToLabel('en')).toBe('English')
    expect(mapLanguageToLabel('es')).toBe('Spanish')
    expect(mapLanguageToLabel(undefined)).toBe('English')
  })

  it('concatenates constraints into special_needs', () => {
    expect(buildSpecialNeeds({ dietary: 'vegetarian', medical: 'asthma' }))
      .toBe('Dietary: vegetarian | Medical: asthma')
    expect(buildSpecialNeeds({})).toBeNull()
  })

  it('flags an unactionable brief with no contact', () => {
    const m = mapBrief({ conversation_id: 'abc', visitor: { name: 'Anon' } })
    expect(m.isActionable).toBe(false)
    expect(m.flags).toContain('unactionable_no_contact')
    expect(m.client.client_source).toBe('concierge')
    expect(m.client.status).toBe('lead') // a brief is a lead until the first booking (352)
  })

  it('produces an actionable mapping with email', () => {
    const m = mapBrief({
      conversation_id: 'abc',
      language: 'es',
      visitor: { name: 'Jane Doe', email: 'jane@example.com' },
      trip: { nationality: 'American' },
      preferences: { comfort_level: 'luxury', interests: ['history', 'food'] },
    })
    expect(m.isActionable).toBe(true)
    expect(m.flags).toHaveLength(0)
    expect(m.client.first_name).toBe('Jane')
    expect(m.client.last_name).toBe('Doe')
    expect(m.client.preferred_language).toBe('Spanish')
    expect(m.client.nationality).toBe('American')
    expect(m.preferences.preferred_tier).toBe('luxury')
    expect(m.preferences.interests).toBe('history, food')
    expect(m.briefRevision).toBe(1)
  })

  it('stamps the normalized brand onto the brief row', () => {
    const m = mapBrief({ conversation_id: 'abc', brand: '  Travel2Egypt ' })
    expect(m.briefRow.brand).toBe('travel2egypt')
  })

  it('brand is null when absent', () => {
    const m = mapBrief({ conversation_id: 'abc' })
    expect(m.briefRow.brand).toBeNull()
  })
})
