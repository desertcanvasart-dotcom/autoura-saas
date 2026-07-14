import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/oauth-state.ts signs OAuth `state` params (CSRF / account-binding
// protection for the Gmail OAuth callback). The module captures the secret
// from env AT IMPORT TIME, so every case re-imports with a fresh module
// registry (same vi.resetModules pattern as the health/version route tests).

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
  it('produces `payload.signature` with a base64url signature', async () => {
    const { signState } = await loadModule()
    const state = signState('user-123')
    const idx = state.lastIndexOf('.')
    expect(state.slice(0, idx)).toBe('user-123')
    const sig = state.slice(idx + 1)
    // HMAC-SHA256 digest in base64url: 43 chars, no padding, no +/
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('is deterministic for the same payload and secret', async () => {
    const { signState } = await loadModule()
    expect(signState('user-123')).toBe(signState('user-123'))
  })

  it('produces different signatures for different payloads', async () => {
    const { signState } = await loadModule()
    const sigA = signState('user-a').split('.').pop()
    const sigB = signState('user-b').split('.').pop()
    expect(sigA).not.toBe(sigB)
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
    const attacker = signState('attacker-id')
    const sig = attacker.slice(attacker.lastIndexOf('.') + 1)
    expect(verifyState(`victim-id.${sig}`)).toBeNull()
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

  it('rejects a payload-only state signed under a different secret', async () => {
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

  it('rejects a state that is only ".signature" (empty payload, idx 0)', async () => {
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
})

describe('verifyState — expiry', () => {
  // NOTE: the module has NO expiry/TTL mechanism — a signed state remains
  // valid forever. This locks the current behavior; a captured state can be
  // replayed at any later time (replay window is unbounded).
  it('still verifies a state signed 10 years ago (no TTL — documented gap)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2016-07-14T00:00:00Z'))
    const { signState, verifyState } = await loadModule()
    const old = signState('user-123')
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'))
    expect(verifyState(old)).toBe('user-123')
  })
})

describe('secret fallback behavior', () => {
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

  // NOTE: with NEITHER env var set, STATE_SECRET is '' and the module still
  // signs/verifies with an empty HMAC key — signatures are then computable
  // by anyone (forgeable). It does not throw or refuse to operate. This
  // locks the current (weak) behavior.
  it('signs and verifies with an empty secret when no env is configured (forgeable — documented gap)', async () => {
    const mod = await loadModule({
      OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    })
    const state = mod.signState('user-123')
    expect(mod.verifyState(state)).toBe('user-123')
  })
})
