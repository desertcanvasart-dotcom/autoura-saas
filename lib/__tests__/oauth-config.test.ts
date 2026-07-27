import { describe, it, expect } from 'vitest'
import { checkGoogleRedirect } from '@/lib/oauth-config'

// ============================================================================
// A wrong GOOGLE_REDIRECT_URI surfaced only AFTER the operator had gone through
// Google's consent screen. Google honours whatever redirect the app sends (as
// long as it is registered), so a stale localhost value sent a real customer to
// a dead tab with ERR_CONNECTION_REFUSED — and nothing named the cause, so the
// hunt started in Google Cloud Console, which was correct all along.
// ============================================================================

const PROD = 'https://getautoura.net'
const GOOD = 'https://getautoura.net/api/auth/google/callback'

describe('a correct configuration passes', () => {
  it('accepts a matching production redirect', () => {
    const r = checkGoogleRedirect(GOOD, PROD)
    expect(r.ok).toBe(true)
    expect(r.redirectUri).toBe(GOOD)
  })

  it('accepts localhost in local development', () => {
    const r = checkGoogleRedirect(
      'http://localhost:3000/api/auth/google/callback',
      'http://localhost:3000'
    )
    expect(r.ok).toBe(true)
  })

  it('does not object when the app URL is unknown', () => {
    // Nothing to compare against is not the same as a mismatch.
    expect(checkGoogleRedirect(GOOD, undefined).ok).toBe(true)
  })
})

describe('the failure that actually happened', () => {
  it('blocks a production deployment still pointing at localhost', () => {
    const r = checkGoogleRedirect('http://localhost:3000/api/auth/google/callback', PROD)
    expect(r.ok).toBe(false)
    expect(r.hint).toContain('localhost')
    expect(r.hint).toContain('getautoura.net')
    // Names the variable and the value to set, so the operator does not go
    // hunting in Google Cloud Console first.
    expect(r.hint).toContain('GOOGLE_REDIRECT_URI')
    expect(r.hint).toContain(`${PROD}/api/auth/google/callback`)
  })

  it('reports the value the running instance would use', () => {
    // This is what makes a config change confirmable from outside the box.
    const r = checkGoogleRedirect('http://localhost:3000/api/auth/google/callback', PROD)
    expect(r.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
  })

  it('treats 127.0.0.1 and ::1 as local too', () => {
    for (const host of ['http://127.0.0.1:3000', 'http://[::1]:3000']) {
      const r = checkGoogleRedirect(`${host}/api/auth/google/callback`, PROD)
      expect(r.ok, host).toBe(false)
    }
  })
})

describe('other misconfigurations', () => {
  it('blocks a missing value', () => {
    for (const v of ['', null, undefined]) {
      const r = checkGoogleRedirect(v as string, PROD)
      expect(r.ok, String(v)).toBe(false)
      expect(r.hint, String(v)).toContain('not set')
    }
  })

  it('catches whitespace — the failure that looks like success', () => {
    // Reads correctly in a dashboard, but no longer matches the Google Console
    // entry byte for byte, so Google answers redirect_uri_mismatch.
    const r = checkGoogleRedirect(`${GOOD}\n`, PROD)
    expect(r.ok).toBe(false)
    expect(r.hint).toContain('whitespace')
  })

  it('blocks a host that is neither local nor this deployment', () => {
    const r = checkGoogleRedirect('https://old-domain.com/api/auth/google/callback', PROD)
    expect(r.ok).toBe(false)
    expect(r.hint).toContain('old-domain.com')
    expect(r.hint).toContain('not this app')
  })

  it('blocks a URL missing the callback path', () => {
    const r = checkGoogleRedirect('https://getautoura.net/api/auth/google', PROD)
    expect(r.ok).toBe(false)
    expect(r.hint).toContain('/api/auth/google/callback')
  })

  it('blocks something that is not a URL at all', () => {
    const r = checkGoogleRedirect('getautoura.net/api/auth/google/callback', PROD)
    expect(r.ok).toBe(false)
  })

  it('never reports ok without a redirect uri', () => {
    for (const v of ['', 'nonsense', 'http://localhost:3000/api/auth/google/callback']) {
      const r = checkGoogleRedirect(v, PROD)
      if (!r.ok) expect(r.error).toBeTruthy()
    }
  })
})
