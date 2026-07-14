import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

// lib/oauth-state.ts signs OAuth `state` params (CSRF / account-binding
// protection for the Gmail OAuth callback). Envelope:
// `${payload}.${issuedAtMs}.${signature}` — the timestamp sits inside the
// signed material, and verifyState enforces a max age (STATE_MAX_AGE_MS by
// default). The secret is resolved lazily from env; each case re-imports
// with a fresh module registry (same vi.resetModules pattern as the
// health/version route tests) so env changes take effect cleanly.

const SECRET = 'test-oauth-state-secret-with-plenty-of-entropy'

type OauthState = typeof import('@/lib/oauth-state')

async function loadModule(env: Record<string, string | undefined> = { OAUTH_STATE_SECRET: SECRET }): Promise<OauthState> {
  vi.resetModules()
  for (const key of ['OAUTH_STATE_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  return import('@/lib/oauth-state')
}

/** Test-side HMAC matching the module's algorithm, for forging malformed envelopes. */
function hmac(material: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(material).digest('base64url')
}

const originalEnv = {
  OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.useRealTimers()
})

describe('signState', () => {
  it('produces `payload.issuedAtMs.signature` with a base64url signature', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'))
    const { signState } = await loadModule()
    const state = signState('user-123')
    // HMAC-SHA256 digest in base64url: 43 chars, no padding, no +/
    expect(state).toMatch(/^user-123\.\d{13}\.[A-Za-z0-9_-]{43}$/)
    expect(Number(state.split('.')[1])).toBe(Date.now())
  })

  it('is deterministic for the same payload, secret, and instant', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'))
    const { signState } = await loadModule()
    expect(signState('user-123')).toBe(signState('user-123'))
  })

  it('produces different signatures for different payloads', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z'))
    const { signState } = await loadModule()
    const sigA = signState('user-a').split('.').pop()
    const sigB = signState('user-b').split('.').pop()
    expect(sigA).not.toBe(sigB)
  })

  it('exports STATE_MAX_AGE_MS = 10 minutes', async () => {
    const { STATE_MAX_AGE_MS } = await loadModule()
    expect(STATE_MAX_AGE_MS).toBe(10 * 60 * 1000)
  })
})

describe('verifyState — round-trip', () => {
  it('recovers the original payload from a validly signed state', async () => {
    const { signState, verifyState } = await loadModule()
    expect(verifyState(signState('user-123'))).toBe('user-123')
  })

  it('round-trips payloads that themselves contain dots (lastIndexOf split)', async () => {
    const { signState, verifyState } = await loadModule()
    const payload = 'user.with.dots@example.com'
    expect(verifyState(signState(payload))).toBe(payload)
  })

  it('round-trips unicode payloads', async () => {
    const { signState, verifyState } = await loadModule()
    const payload = 'usér-ñ-测试'
    expect(verifyState(signState(payload))).toBe(payload)
  })
})

describe('verifyState — tampering rejected', () => {
  it('rejects a state whose payload was swapped (attacker substitutes victim user id)', async () => {
    const { signState, verifyState } = await loadModule()
    const [, ts, sig] = signState('attacker-id').split('.')
    expect(verifyState(`victim-id.${ts}.${sig}`)).toBeNull()
  })

  it('rejects a state whose timestamp was extended after signing', async () => {
    const { signState, verifyState } = await loadModule()
    const [payload, ts, sig] = signState('user-123').split('.')
    expect(verifyState(`${payload}.${Number(ts) + 60_000}.${sig}`)).toBeNull()
  })

  it('rejects a state with a single flipped signature character', async () => {
    const { signState, verifyState } = await loadModule()
    const state = signState('user-123')
    const flipped =
      state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A')
    expect(verifyState(flipped)).toBeNull()
  })

  it('rejects a truncated signature (length mismatch short-circuit)', async () => {
    const { signState, verifyState } = await loadModule()
    const state = signState('user-123')
    expect(verifyState(state.slice(0, -1))).toBeNull()
  })

  it('rejects a state signed under a different secret', async () => {
    const modA = await loadModule({ OAUTH_STATE_SECRET: 'secret-A' })
    const forged = modA.signState('user-123')
    const modB = await loadModule({ OAUTH_STATE_SECRET: 'secret-B' })
    expect(modB.verifyState(forged)).toBeNull()
    // Sanity: under its own secret it verifies.
    const modA2 = await loadModule({ OAUTH_STATE_SECRET: 'secret-A' })
    expect(modA2.verifyState(forged)).toBe('user-123')
  })
})

describe('verifyState — missing/malformed input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('returns null for %s', async (_label, input) => {
    const { verifyState } = await loadModule()
    expect(verifyState(input)).toBeNull()
  })

  it('rejects a state with no dot separator', async () => {
    const { verifyState } = await loadModule()
    expect(verifyState('just-a-raw-user-id')).toBeNull()
  })

  it('rejects a state that starts with the signature dot (empty issued part, idx 0)', async () => {
    const { signState, verifyState } = await loadModule()
    const sig = signState('x').split('.').pop()
    expect(verifyState(`.${sig}`)).toBeNull()
  })

  it('rejects a state ending in a bare dot (empty signature)', async () => {
    const { verifyState } = await loadModule()
    expect(verifyState('user-123.')).toBeNull()
  })

  it('rejects a raw unsigned user id with a dot in it (the pre-fix attack shape)', async () => {
    const { verifyState } = await loadModule()
    expect(verifyState('victim.uuid')).toBeNull()
  })

  it('rejects an old-envelope state (`payload.signature`, no timestamp) even with a valid signature', async () => {
    const { verifyState } = await loadModule()
    // Pre-timestamp envelope: HMAC over the payload alone, same secret. The
    // signature check passes but there is no timestamp segment to parse.
    expect(verifyState(`user-123.${hmac('user-123')}`)).toBeNull()
  })

  it('rejects a correctly signed envelope whose timestamp is not numeric', async () => {
    const { verifyState } = await loadModule()
    const issued = 'user-123.notanumber'
    expect(verifyState(`${issued}.${hmac(issued)}`)).toBeNull()
  })

  it('rejects a correctly signed envelope with an empty payload segment', async () => {
    const { verifyState } = await loadModule()
    const issued = `.${Date.now()}`
    expect(verifyState(`${issued}.${hmac(issued)}`)).toBeNull()
  })
})

describe('verifyState — expiry (fake timers, no real waits)', () => {
  const T0 = new Date('2026-07-14T12:00:00Z')

  it('accepts a state exactly at the max-age boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const { signState, verifyState, STATE_MAX_AGE_MS } = await loadModule()
    const state = signState('user-123')
    vi.setSystemTime(T0.getTime() + STATE_MAX_AGE_MS)
    expect(verifyState(state)).toBe('user-123')
  })

  it('rejects a state 1ms past the max age', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const { signState, verifyState, STATE_MAX_AGE_MS } = await loadModule()
    const state = signState('user-123')
    vi.setSystemTime(T0.getTime() + STATE_MAX_AGE_MS + 1)
    expect(verifyState(state)).toBeNull()
  })

  it('rejects a 10-year-old state (replay window is bounded)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2016-07-14T00:00:00Z'))
    const { signState, verifyState } = await loadModule()
    const old = signState('user-123')
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'))
    expect(verifyState(old)).toBeNull()
  })

  it('rejects a state issued in the future (negative age)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const { signState, verifyState } = await loadModule()
    const state = signState('user-123')
    vi.setSystemTime(T0.getTime() - 1)
    expect(verifyState(state)).toBeNull()
  })

  it('honors a caller-supplied maxAgeMs override', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const { signState, verifyState } = await loadModule()
    const state = signState('user-123')
    vi.setSystemTime(T0.getTime() + 2_000)
    expect(verifyState(state, 1_000)).toBeNull()
    expect(verifyState(state, 5_000)).toBe('user-123')
  })
})

describe('secret resolution (lazy)', () => {
  it('falls back to SUPABASE_SERVICE_ROLE_KEY when OAUTH_STATE_SECRET is unset', async () => {
    const modFallback = await loadModule({
      OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })
    const state = modFallback.signState('user-123')
    const modExplicit = await loadModule({
      OAUTH_STATE_SECRET: 'service-role-key',
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    expect(modExplicit.verifyState(state)).toBe('user-123')
  })

  it('prefers OAUTH_STATE_SECRET over the service-role key', async () => {
    const mod = await loadModule({
      OAUTH_STATE_SECRET: 'dedicated',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })
    const state = mod.signState('user-123')
    const serviceOnly = await loadModule({
      OAUTH_STATE_SECRET: 'service-role-key',
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    expect(serviceOnly.verifyState(state)).toBeNull()
  })

  it('signState throws when no secret is configured (never signs with an empty key)', async () => {
    const mod = await loadModule({
      OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    expect(() => mod.signState('user-123')).toThrow(/OAUTH_STATE_SECRET/)
  })

  it('verifyState throws (not silently null) when no secret is configured and a signature must be checked', async () => {
    const mod = await loadModule({
      OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    // The secret is resolved lazily inside sign(); only inputs that reach the
    // signature computation hit it — shape-invalid inputs still return null.
    expect(() => mod.verifyState('user-123.1234567890123.somesig')).toThrow(/OAUTH_STATE_SECRET/)
    expect(mod.verifyState(null)).toBeNull()
    expect(mod.verifyState('no-dot')).toBeNull()
  })

  it('resolves the secret lazily: import succeeds without env, signing works once env appears', async () => {
    const mod = await loadModule({
      OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    process.env.OAUTH_STATE_SECRET = SECRET
    expect(mod.verifyState(mod.signState('user-123'))).toBe('user-123')
  })
})
