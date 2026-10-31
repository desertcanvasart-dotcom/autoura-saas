// ============================================
// Supplier accounts — sign in by phone + one-time code (Phase 2B)
// ============================================
// docs/supplier-network/PLAN.md §6 stage 2B, migration 450. Pure rules: the
// phone a supplier types, matching it to agencies' supplier records, the
// code (10 minutes, 5 tries, 3 sends per 15 minutes, stored as a hash) and
// the session token (30 days, stored as a hash). Suppliers are never tenant
// users; everything here is used by service-role routes.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { formatPhoneForWhatsApp } from '@/lib/communication-utils'

export const CODE_TTL_MINUTES = 10
export const CODE_MAX_ATTEMPTS = 5
export const CODE_MAX_SENDS = 3
export const CODE_SEND_WINDOW_MINUTES = 15
export const SESSION_DAYS = 30
export const SESSION_COOKIE = 'autoura_supplier_session'

/**
 * The phone as typed at sign-in, as international digits. It must carry the
 * country code (+ or 00): a local number could belong to any country, and
 * guessing would match the wrong supplier.
 */
export function normalizeLoginPhone(input: unknown): { ok: true; phone: string } | { ok: false; error: string } {
  const raw = typeof input === 'string' ? input.trim().replace(/[\s\-().]/g, '') : ''
  const intl = raw.startsWith('+') ? raw.slice(1) : raw.startsWith('00') ? raw.slice(2) : null
  if (intl === null || !/^[0-9]{8,15}$/.test(intl)) {
    return { ok: false, error: 'Type your number with the country code, for example +20 100 123 4567' }
  }
  return { ok: true, phone: intl }
}

/** The last digits used to narrow the database search before an exact check. */
export function phoneTail(phone: string): string {
  return phone.slice(-9)
}

/** Is this supplier record's number the signed-in phone? Local numbers read with the agency's country. */
export function recordMatchesPhone(
  record: { whatsapp?: string | null; phone?: string | null; contact_phone?: string | null },
  agencyCountry: string | null | undefined,
  phone: string,
): boolean {
  return [record.whatsapp, record.phone, record.contact_phone]
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .some(p => formatPhoneForWhatsApp(p, agencyCountry) === phone)
}

// ── Codes ───────────────────────────────────────────────────────────────

export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Bound to the account, so a code row cannot be replayed against another. */
export function hashLoginCode(code: string, accountId: string): string {
  return createHash('sha256').update(`${accountId}:${code}`).digest('hex')
}

export function codeExpiry(now: Date): string {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString()
}

/** May another code be sent? At most CODE_MAX_SENDS in CODE_SEND_WINDOW_MINUTES. */
export function canSendCode(recentSentAt: string[], now: Date): boolean {
  const from = now.getTime() - CODE_SEND_WINDOW_MINUTES * 60_000
  return recentSentAt.filter(t => Date.parse(t) >= from).length < CODE_MAX_SENDS
}

export type CodeCheck = { ok: true } | { ok: false; error: string; spend: boolean }

type CodeRow = { code_hash: string; expires_at: string; attempts: number; used_at: string | null }

/**
 * May this try be compared at all? Everything checkLoginCode checks except the
 * code itself: the route takes the try (counts it) between the two, so
 * parallel guesses can't all slip in under the cap.
 */
export function canTryCode(row: CodeRow | null, typed: unknown, now: Date): CodeCheck {
  if (!row || row.used_at) return { ok: false, error: 'Ask for a new code', spend: false }
  if (Date.parse(row.expires_at) < now.getTime()) return { ok: false, error: 'That code has expired — ask for a new one', spend: false }
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, error: 'Too many tries — ask for a new code', spend: false }
  const code = typeof typed === 'string' ? typed.replace(/\s/g, '') : ''
  if (!/^[0-9]{6}$/.test(code)) return { ok: false, error: 'Type the 6-digit code', spend: false }
  return { ok: true }
}

/** Check a typed code against the latest code row. `spend` = count this try. */
export function checkLoginCode(
  row: CodeRow | null,
  typed: unknown,
  accountId: string,
  now: Date,
): CodeCheck {
  const allowed = canTryCode(row, typed, now)
  if (!allowed.ok || !row) return allowed.ok ? { ok: false, error: 'Ask for a new code', spend: false } : allowed
  const code = (typed as string).replace(/\s/g, '')
  const a = Buffer.from(hashLoginCode(code, accountId), 'hex')
  const b = Buffer.from(row.code_hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'That code is not right', spend: true }
  return { ok: true }
}

/** Where the code may go: the emails on the matched supplier records (distinct, lower-cased). */
export function codeEmails(records: Array<{ email?: string | null; contact_email?: string | null }>): string[] {
  const out = new Set<string>()
  for (const r of records) for (const e of [r.email, r.contact_email]) {
    const v = (e ?? '').trim().toLowerCase()
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) out.add(v)
  }
  return [...out]
}

/** "a•••@gmail.com" — shown on screen so the supplier knows where to look. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 1)}•••@${domain}`
}

// ── Sessions ────────────────────────────────────────────────────────────

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionExpiry(now: Date): string {
  return new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString()
}

export function isSessionLive(s: { expires_at: string; revoked_at: string | null } | null, now: Date): boolean {
  return !!s && !s.revoked_at && Date.parse(s.expires_at) > now.getTime()
}

/**
 * Can this supplier sign in (2B)? They need an email on the record (the code
 * goes there) and a number that reads as international (with the agency's
 * country for local ones). The office is told what is missing.
 */
export function signInReadiness(
  record: { email?: string | null; contact_email?: string | null; whatsapp?: string | null; phone?: string | null; contact_phone?: string | null },
  agencyCountry: string | null | undefined,
): { ok: boolean; reason: string | null } {
  const numbers = [record.whatsapp, record.phone, record.contact_phone].filter((p): p is string => !!p && !!p.trim())
  if (numbers.length === 0) return { ok: false, reason: 'No phone number on this supplier — they cannot sign in (their page link still works).' }
  if (codeEmails([record]).length === 0) return { ok: false, reason: 'No email on this supplier — they cannot sign in yet (the code goes by email). Their page link still works.' }
  const international = numbers.some(p => /^[0-9]{8,15}$/.test(formatPhoneForWhatsApp(p, agencyCountry)) && !formatPhoneForWhatsApp(p, agencyCountry).startsWith('0'))
  if (!international) return { ok: false, reason: 'Their number has no country code and your agency has no country set — set it in Settings → Company so they can sign in.' }
  return { ok: true, reason: null }
}
