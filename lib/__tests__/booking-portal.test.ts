import { describe, it, expect } from 'vitest'
import {
  generatePortalToken,
  isValidPortalToken,
  portalLinkState,
  expiryFromStartDate,
  portalVerifyCookieName,
  portalVerifyCookieValue,
  isPortalVerified,
  normalizeVerifyAnswer,
  normalizeDob,
  verifyTravellerAnswer,
  verifyAnswerMatches,
  pickWritableFields,
  mintOrReusePassengerLink,
} from '../booking-portal'

// C1a: the customer portal's security core. What matters most: the gate
// fails CLOSED (missing DOB, short answers, forged cookies), and the
// traveller-form write path is an allow-list that identity/linkage columns
// can never cross.

describe('tokens and link state', () => {
  it('generates 32-char base64url tokens that validate', () => {
    const t = generatePortalToken()
    expect(t).toHaveLength(32)
    expect(isValidPortalToken(t)).toBe(true)
    expect(isValidPortalToken('short')).toBe(false)
    expect(isValidPortalToken(t + '!')).toBe(false)
    expect(isValidPortalToken(null)).toBe(false)
  })

  it('link state: revoked, expired, missing, usable', () => {
    const now = new Date('2026-08-29T12:00:00Z')
    expect(portalLinkState(null, now).reason).toBe('not_found')
    expect(portalLinkState({ revoked_at: '2026-08-01', expires_at: null }, now).reason).toBe('revoked')
    expect(portalLinkState({ revoked_at: null, expires_at: '2026-08-28T00:00:00Z' }, now).reason).toBe('expired')
    expect(portalLinkState({ revoked_at: null, expires_at: '2026-12-01T00:00:00Z' }, now).usable).toBe(true)
    expect(portalLinkState({ revoked_at: null, expires_at: null }, now).usable).toBe(true)
  })

  it('links expire 30 days after departure', () => {
    expect(expiryFromStartDate('2026-10-01')).toBe('2026-10-31T23:59:59.000Z')
    expect(expiryFromStartDate(null)).toBeNull()
  })
})

describe('the confirmation-gate cookie', () => {
  it('cookie value is an HMAC — not derivable from the token, verifiable by us', () => {
    const t = generatePortalToken()
    const value = portalVerifyCookieValue(t)
    expect(value).not.toContain(t)
    expect(isPortalVerified(t, value)).toBe(true)
    expect(isPortalVerified(t, value.slice(0, -1) + '0')).toBe(false)
    expect(isPortalVerified(t, undefined)).toBe(false)
    expect(portalVerifyCookieName(t)).not.toBe(portalVerifyCookieName(generatePortalToken()))
  })
})

describe('answer matching', () => {
  it('normalizes case, width and whitespace in any script', () => {
    expect(normalizeVerifyAnswer(' Haddad ')).toBe('haddad')
    expect(normalizeVerifyAnswer('ＨＡＤＤＡＤ')).toBe('haddad') // full-width
    expect(normalizeDob('1990/1/5')).toBe('1990-01-05')
    expect(normalizeDob('1990-01-05T00:00:00Z')).toBe('1990-01-05')
    expect(normalizeDob('nonsense')).toBe('')
  })

  it('booking-level: booking number, client family-name token, or lead name', () => {
    const facts = {
      booking_number: 'BKG-2026-0001',
      client_name: 'Rania Haddad',
      lead_names: ['Haddad', 'Rania Haddad'],
    }
    expect(verifyAnswerMatches('bkg-2026-0001', facts)).toBe(true)
    expect(verifyAnswerMatches('Haddad', facts)).toBe(true)
    expect(verifyAnswerMatches('Rania Haddad', facts)).toBe(true)
    expect(verifyAnswerMatches('Smith', facts)).toBe(false)
    expect(verifyAnswerMatches('H', facts)).toBe(false) // too short
  })

  it('private link demands name AND dob — and fails closed with no DOB on file', () => {
    const pax = { names: ['Haddad'], date_of_birth: '1990-01-05' }
    expect(verifyTravellerAnswer('Haddad', '1990-01-05', pax)).toBe(true)
    expect(verifyTravellerAnswer('Haddad', '1990-01-06', pax)).toBe(false)
    expect(verifyTravellerAnswer('Smith', '1990-01-05', pax)).toBe(false)
    expect(verifyTravellerAnswer('Haddad', '', pax)).toBe(false)
    expect(verifyTravellerAnswer('Haddad', '1990-01-05', { names: ['Haddad'], date_of_birth: null })).toBe(false)
  })
})

describe('pickWritableFields', () => {
  it('lets form fields through, silently drops identity/linkage columns', () => {
    const patch = pickWritableFields({
      first_name: 'Rania',
      passport_number: 'X123',
      medical_conditions: '',
      // attack payload — none of these may survive
      id: 'evil',
      tenant_id: 'evil',
      booking_id: 'evil',
      is_lead_passenger: true,
      passenger_type: 'adult',
      room_type: 'suite',
    })
    expect(patch).toEqual({ first_name: 'Rania', passport_number: 'X123', medical_conditions: null })
  })

  it('drops non-string junk and truncates absurd lengths', () => {
    const patch = pickWritableFields({ first_name: { $gt: '' }, special_requests: 'x'.repeat(9000) })
    expect(patch.first_name).toBeUndefined()
    expect((patch.special_requests as string).length).toBe(500)
  })
})

describe('mintOrReusePassengerLink', () => {
  function fakeDb(existingToken: string | null) {
    const inserts: Record<string, unknown>[] = []
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      maybeSingle: async () => ({ data: existingToken ? { token: existingToken } : null }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { token: row.token }, error: null }) }) }
      },
    }
    return { db: { from: () => builder }, inserts }
  }

  it('reuses the one live link instead of minting a second', async () => {
    const { db, inserts } = fakeDb('existing-token-existing-token-abc')
    const r = await mintOrReusePassengerLink(db, { tenantId: 't', bookingId: 'b', passengerId: null, startDate: null })
    expect(r).toEqual({ token: 'existing-token-existing-token-abc', created: false })
    expect(inserts).toHaveLength(0)
  })

  it('mints with the departure-based expiry when none exists', async () => {
    const { db, inserts } = fakeDb(null)
    const r = await mintOrReusePassengerLink(db, { tenantId: 't', bookingId: 'b', passengerId: 'p1', startDate: '2026-10-01' })
    expect('token' in r && r.created).toBe(true)
    expect(inserts[0].passenger_id).toBe('p1')
    expect(inserts[0].expires_at).toBe('2026-10-31T23:59:59.000Z')
  })
})
