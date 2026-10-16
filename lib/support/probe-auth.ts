// ============================================
// Who may ask an install how it is
// ============================================
// /api/health/deep sits under the '/api/health' prefix, which middleware lets
// through WITHOUT a session — deliberately, because the shallow probe is
// public. So this function is the only thing standing in front of the deep one,
// and it fails closed: with no secret configured, nothing authenticates.
//
// A monitor cannot hold a session, which is why a bearer token exists at all.

import crypto from 'crypto'

/**
 * Constant-time bearer comparison.
 *
 * The length check leaks the secret's length, which is not worth defending; the
 * byte comparison does not leak where the first difference is, which is.
 */
export function bearerMatches(header: string | null | undefined, secret: string | undefined): boolean {
  if (typeof secret !== 'string' || secret.trim() === '') return false
  if (typeof header !== 'string') return false

  const expected = `Bearer ${secret}`
  const given = Buffer.from(header)
  const want = Buffer.from(expected)
  if (given.length !== want.length) return false
  return crypto.timingSafeEqual(given, want)
}

/** `given` equals `secret`, compared in constant time; false when either is unset. */
export function secretMatches(given: string | null | undefined, secret: string | undefined): boolean {
  if (typeof secret !== 'string' || secret.trim() === '') return false
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
