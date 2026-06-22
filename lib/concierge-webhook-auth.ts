// ============================================
// CONCIERGE WEBHOOK — HMAC-SHA256 SIGNATURE VERIFICATION
// ============================================
// Verifies inbound briefs from the Travel2Egypt AI Concierge.
//
// Scheme:
//   - Signature header:  X-Autoura-Signature: t=<unix>,v1=<hexdigest>
//   - Companion header:  X-Autoura-Timestamp: <unix>   (must equal t)
//   - Signed content:    `${t}.${rawBody}`   (timestamp + "." + raw bytes)
//   - Algorithm:         HMAC-SHA256, lowercase hex
//   - Replay window:     |now - t| <= 300s
//   - Dual secret:       CONCIERGE_WEBHOOK_SECRET (current) and
//                        CONCIERGE_WEBHOOK_SECRET_PREVIOUS (rotation overlap)
//                        — a request is valid if it matches EITHER.
// ============================================

import { createHmac, timingSafeEqual } from 'crypto'

export const SIGNATURE_HEADER = 'x-autoura-signature'
export const TIMESTAMP_HEADER = 'x-autoura-timestamp'
export const REQUEST_ID_HEADER = 'x-request-id'
export const DRY_RUN_HEADER = 'x-autoura-dry-run'

export const DEFAULT_TOLERANCE_SECONDS = 300

export type VerifyFailureCode =
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_mismatch'   // X-Autoura-Timestamp present but != t
  | 'timestamp_expired'    // outside tolerance window (replay protection)
  | 'no_secret_configured'
  | 'signature_mismatch'

export type VerifyResult =
  | { ok: true; secretUsed: 'current' | 'previous'; timestamp: number }
  | { ok: false; code: VerifyFailureCode; message: string }

/**
 * Compute the lowercase hex HMAC-SHA256 of `${timestamp}.${rawBody}`.
 * Exported so the dry-run tooling and the GET test-vector endpoint can
 * produce signatures the concierge can reproduce.
 */
export function signConciergePayload(
  secret: string,
  timestamp: number | string,
  rawBody: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
}

/** Build the full `t=<unix>,v1=<hex>` signature header value. */
export function buildSignatureHeader(
  secret: string,
  timestamp: number,
  rawBody: string
): string {
  return `t=${timestamp},v1=${signConciergePayload(secret, timestamp, rawBody)}`
}

/** Parse `t=...,v1=...` (tolerant of extra/future schemes like `v0=`). */
export function parseSignatureHeader(
  header: string | null | undefined
): { t?: string; v1?: string } | null {
  if (!header) return null
  const out: { t?: string; v1?: string } = {}
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') out.t = value
    else if (key === 'v1') out.v1 = value
  }
  if (out.t === undefined && out.v1 === undefined) return null
  return out
}

/** Constant-time hex comparison that never throws on length mismatch. */
function safeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** The configured secrets, current first. Empty if none set. */
export function getConfiguredSecrets(): Array<{ label: 'current' | 'previous'; secret: string }> {
  const out: Array<{ label: 'current' | 'previous'; secret: string }> = []
  const current = process.env.CONCIERGE_WEBHOOK_SECRET
  const previous = process.env.CONCIERGE_WEBHOOK_SECRET_PREVIOUS
  if (current) out.push({ label: 'current', secret: current })
  if (previous) out.push({ label: 'previous', secret: previous })
  return out
}

export interface VerifyParams {
  rawBody: string
  signatureHeader: string | null | undefined
  timestampHeader?: string | null | undefined
  secrets?: Array<{ label: 'current' | 'previous'; secret: string }>
  toleranceSeconds?: number
  /** unix seconds; injectable for tests. Defaults to current time. */
  nowSeconds?: number
}

export function verifyConciergeSignature(params: VerifyParams): VerifyResult {
  const {
    rawBody,
    signatureHeader,
    timestampHeader,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = params

  const secrets = params.secrets ?? getConfiguredSecrets()
  if (secrets.length === 0) {
    return { ok: false, code: 'no_secret_configured', message: 'No CONCIERGE_WEBHOOK_SECRET configured on the server.' }
  }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return { ok: false, code: 'missing_signature', message: `Missing or empty ${SIGNATURE_HEADER} header.` }
  }
  if (!parsed.t || !parsed.v1) {
    return { ok: false, code: 'malformed_signature', message: `${SIGNATURE_HEADER} must contain both t=<unix> and v1=<hex>.` }
  }

  const t = Number(parsed.t)
  if (!Number.isFinite(t) || !Number.isInteger(t)) {
    return { ok: false, code: 'malformed_signature', message: 'Signature timestamp (t) is not a valid unix integer.' }
  }

  // Companion header must agree with t if provided.
  if (timestampHeader != null && timestampHeader !== '' && timestampHeader !== parsed.t) {
    return { ok: false, code: 'timestamp_mismatch', message: `${TIMESTAMP_HEADER} does not match the t value inside ${SIGNATURE_HEADER}.` }
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - t) > toleranceSeconds) {
    return { ok: false, code: 'timestamp_expired', message: `Timestamp outside the ${toleranceSeconds}s tolerance window (replay protection).` }
  }

  for (const { label, secret } of secrets) {
    const expected = signConciergePayload(secret, parsed.t, rawBody)
    if (safeHexEqual(expected, parsed.v1)) {
      return { ok: true, secretUsed: label, timestamp: t }
    }
  }

  return { ok: false, code: 'signature_mismatch', message: 'Signature does not match any configured secret.' }
}
