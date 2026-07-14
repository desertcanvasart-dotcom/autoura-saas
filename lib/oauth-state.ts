import crypto from 'crypto'

/**
 * Signing/verification for OAuth `state` parameters.
 *
 * The Gmail OAuth callback (`app/api/auth/google/callback/route.ts`)
 * previously trusted a raw user id embedded in `state`, so an attacker
 * could initiate their own Google OAuth flow with `state=<victim_user_id>`
 * and have the callback bind THEIR Google tokens to the victim's
 * `gmail_tokens.user_id` row — the victim's email sync would then run
 * against the attacker's mailbox.
 *
 * We sign the state at connect time and verify the signature at the
 * callback, so the embedded user id cannot be forged. Identical port of
 * the same helper used by the sibling app (travel-ops-pro) — same
 * algorithm, same envelope format.
 *
 * Secret falls back to the service-role key (server-only, high entropy)
 * when a dedicated OAUTH_STATE_SECRET isn't configured.
 */
/** OAuth round-trips complete in seconds; anything older is a replay. */
export const STATE_MAX_AGE_MS = 10 * 60 * 1000

// Resolved lazily (not at module scope): the env-less `next build` evaluates
// every importer, and a missing secret must fail the actual OAuth call, not
// the build. An empty HMAC key would make states forgeable by anyone.
function stateSecret(): string {
  const secret =
    process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error(
      'oauth-state: neither OAUTH_STATE_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set'
    )
  }
  return secret
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url')
}

/**
 * Returns `${payload}.${issuedAtMs}.${signature}` for use as an OAuth `state`
 * parameter. The timestamp is inside the signed material, so it cannot be
 * extended after the fact.
 */
export function signState(payload: string): string {
  const issued = `${payload}.${Date.now()}`
  return `${issued}.${sign(issued)}`
}

/**
 * Verifies a signed state and returns the original payload, or null if the
 * signature is missing/invalid or the state is older than `maxAgeMs`
 * (default {@link STATE_MAX_AGE_MS}). Use this to recover the user id at the
 * callback. States from the pre-timestamp envelope verify as null — callers
 * just restart the OAuth flow.
 */
export function verifyState(
  state: string | null | undefined,
  maxAgeMs: number = STATE_MAX_AGE_MS
): string | null {
  if (!state) return null
  const sigIdx = state.lastIndexOf('.')
  if (sigIdx <= 0) return null
  const issued = state.slice(0, sigIdx)
  const sig = state.slice(sigIdx + 1)
  const expected = sign(issued)
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  const tsIdx = issued.lastIndexOf('.')
  if (tsIdx <= 0) return null
  const ts = Number(issued.slice(tsIdx + 1))
  if (!Number.isFinite(ts)) return null
  const age = Date.now() - ts
  if (age < 0 || age > maxAgeMs) return null
  return issued.slice(0, tsIdx)
}
