// ============================================
// CUSTOMER PORTAL — tokens, gate, link lifecycle (C1a)
// ============================================
// Design port of the reference implementation's booking portal. The URL
// token is the credential (middleware self-auth allowlist; every /api/portal
// route re-validates it); the CONFIRMATION GATE is the second, human factor
// against a FORWARDED link: before the page shows anything, the visitor
// states a fact the traveller knows. Passing sets a cookie that is an HMAC
// over the token with a server-side secret — possessing the URL is not
// possession of the cookie.

import { createHmac, createHash } from 'crypto'
import { sendMail } from '@/lib/email-send'

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** base64url of 24 random bytes. */
export function generatePortalToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isValidPortalToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
}

export interface PortalLinkRow {
  id: string
  tenant_id: string
  booking_id: string
  passenger_id: string | null
  revoked_at: string | null
  expires_at: string | null
  form_locked: boolean
}

export function portalLinkState(
  link: Pick<PortalLinkRow, 'revoked_at' | 'expires_at'> | null,
  now: Date = new Date()
): { usable: boolean; reason: 'not_found' | 'revoked' | 'expired' | null } {
  if (!link) return { usable: false, reason: 'not_found' }
  if (link.revoked_at) return { usable: false, reason: 'revoked' }
  if (link.expires_at && Date.parse(link.expires_at) <= now.getTime()) {
    return { usable: false, reason: 'expired' }
  }
  return { usable: true, reason: null }
}

/** A link outlives the trip by a month, then stops answering. */
const DAYS_AFTER_DEPARTURE = 30

export function expiryFromStartDate(startDate: string | null | undefined): string | null {
  if (!startDate) return null
  return new Date(
    Date.parse(`${startDate.slice(0, 10)}T23:59:59Z`) + DAYS_AFTER_DEPARTURE * 86_400_000
  ).toISOString()
}

// ---------------------------------------------------------------------------
// Confirmation gate — cookie
// ---------------------------------------------------------------------------

function portalVerifySecret(): string {
  // A dedicated secret when configured; the service key otherwise — server-
  // only and long, which is all HMAC needs. Never sent anywhere.
  return process.env.PORTAL_VERIFY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** Cookie name derives from the token so one browser can hold verified state
 *  for several links without collisions. */
export function portalVerifyCookieName(token: string): string {
  return 'pv_' + createHash('sha256').update(token).digest('hex').slice(0, 16)
}

export function portalVerifyCookieValue(token: string): string {
  return createHmac('sha256', portalVerifySecret()).update(`portal-verify:${token}`).digest('hex')
}

export function isPortalVerified(token: string, cookieValue: string | undefined | null): boolean {
  return !!cookieValue && cookieValue === portalVerifyCookieValue(token)
}

// ---------------------------------------------------------------------------
// Confirmation gate — answer matching
// ---------------------------------------------------------------------------

/** NFKC, lowercase, all whitespace stripped — a visitor must not fail the
 *  gate over letter case, width, or a stray space (any script). */
export function normalizeVerifyAnswer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** Normalize a date answer to YYYY-MM-DD, or '' if unusable. */
export function normalizeDob(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const sep = raw.normalize('NFKC').match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (sep) return `${sep[1]}-${sep[2].padStart(2, '0')}-${sep[3].padStart(2, '0')}`
  return ''
}

/** Per-traveller gate: a private link unlocks ONE person's passport details,
 *  so it demands that person's family name AND date of birth — both. A
 *  forwarded link is useless without the DOB. No DOB on file = fail closed. */
export function verifyTravellerAnswer(
  nameAnswer: unknown,
  dobAnswer: unknown,
  traveller: { names?: Array<string | null | undefined>; date_of_birth?: string | null }
): boolean {
  const givenName = normalizeVerifyAnswer(nameAnswer)
  if (givenName.length < 2) return false
  const nameOk = (traveller.names ?? []).some(n => {
    const c = normalizeVerifyAnswer(n)
    return c.length >= 2 && c === givenName
  })
  if (!nameOk) return false
  const givenDob = normalizeDob(dobAnswer)
  const realDob = normalizeDob(traveller.date_of_birth)
  if (!givenDob || !realDob) return false
  return givenDob === realDob
}

/** Booking-level gate: booking number, client name (full or family token),
 *  or the lead traveller's name. */
export function verifyAnswerMatches(
  answer: unknown,
  facts: {
    booking_number?: string | null
    client_name?: string | null
    lead_names?: Array<string | null | undefined>
  }
): boolean {
  const given = normalizeVerifyAnswer(answer)
  if (given.length < 2) return false

  const candidates = new Set<string>()
  const add = (v: string | null | undefined) => {
    const n = normalizeVerifyAnswer(v)
    if (n.length >= 2) candidates.add(n)
  }
  add(facts.booking_number)
  add(facts.client_name)
  // The last space-separated token of the client name (family name in
  // "Given Family" order; harmless otherwise).
  const parts = String(facts.client_name ?? '').trim().split(/\s+/)
  if (parts.length > 1) add(parts[parts.length - 1])
  for (const n of facts.lead_names ?? []) add(n)

  return candidates.has(given)
}

// ---------------------------------------------------------------------------
// Traveller form — writable fields
// ---------------------------------------------------------------------------

/** The ONLY booking_passengers columns a traveller may write. An allow-list:
 *  identity/linkage columns (id, tenant_id, booking_id, passenger_type,
 *  is_lead_passenger, room assignment) must never be reachable from the
 *  portal, and a column nobody has thought about yet stays unreachable by
 *  default. */
export const PASSENGER_WRITABLE_FIELDS = [
  'title',
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'nationality',
  'email',
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
  'passport_number',
  'passport_expiry',
  'passport_issuing_country',
  'meal_preference',
  'mobility_requirements',
  'medical_conditions',
  'special_requests',
] as const

export function pickWritableFields(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!body || typeof body !== 'object') return out
  const record = body as Record<string, unknown>
  for (const field of PASSENGER_WRITABLE_FIELDS) {
    if (field in record) {
      const value = record[field]
      if (value === null || value === '') out[field] = null
      else if (typeof value === 'string') out[field] = value.slice(0, 500)
      // non-string junk is dropped, not coerced
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Mint / reuse / deliver
// ---------------------------------------------------------------------------
// Shared by the operator side (bookings/[id] portal button) and the lead
// coordinator inside the portal, so the one-live-link-per-(booking,passenger)
// rule, the expiry and the delivery live in ONE place.

// Loose structural query surface — the callers hand in either the typed
// admin client or a test stub; a chain of `unknown`-returning methods keeps
// the ratchet clean without fighting the client generics.
type Chain = {
  select(cols: string): Chain
  eq(col: string, v: unknown): Chain
  is(col: string, v: unknown): Chain
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null }>
  insert(row: Record<string, unknown>): { select(cols: string): { single(): PromiseLike<{ data: Record<string, unknown>; error: { message: string } | null }> } }
  update(patch: Record<string, unknown>): Chain
}
interface PortalDb {
  from(table: string): Chain
}

export async function mintOrReusePassengerLink(
  admin: object,
  opts: {
    tenantId: string
    bookingId: string
    passengerId: string | null
    startDate: string | null | undefined
    createdBy?: string | null
  }
): Promise<{ token: string; created: boolean } | { error: string }> {
  const db = admin as PortalDb
  const base = db
    .from('booking_portal_links')
    .select('token')
    .eq('booking_id', opts.bookingId)
    .eq('tenant_id', opts.tenantId)
    .is('revoked_at', null)
  const { data: existing } = await (opts.passengerId
    ? base.eq('passenger_id', opts.passengerId)
    : base.is('passenger_id', null)
  ).maybeSingle()

  if (existing) return { token: existing.token as string, created: false }

  const { data, error } = await db
    .from('booking_portal_links')
    .insert({
      tenant_id: opts.tenantId,
      booking_id: opts.bookingId,
      passenger_id: opts.passengerId,
      token: generatePortalToken(),
      expires_at: expiryFromStartDate(opts.startDate),
      created_by: opts.createdBy ?? null,
    })
    .select('token')
    .single()
  if (error) return { error: error.message as string }
  return { token: data.token as string, created: true }
}

/** Stamp a link as sent and best-effort email it. Never throws — a delivery
 *  failure must not fail the caller; the URL can always be copied. */
export async function markSentAndDeliver(
  admin: object,
  opts: { token: string; passengerId: string; tenantId: string; url: string; tripName?: string | null }
): Promise<{ sent: boolean }> {
  const db = admin as PortalDb
  await db
    .from('booking_portal_links')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('token', opts.token)
    .eq('tenant_id', opts.tenantId)

  const { data: pax } = await db
    .from('booking_passengers')
    .select('email, first_name')
    .eq('id', opts.passengerId)
    .maybeSingle()
  if (!pax?.email) return { sent: false }

  try {
    const result = await sendMail({
      to: pax.email as string,
      subject: `Please complete your traveller details${opts.tripName ? ` — ${opts.tripName}` : ''}`,
      html:
        `<p>${pax.first_name ? `Dear ${pax.first_name},` : 'Hello,'}</p>` +
        `<p>Please complete your traveller details for the upcoming trip using your personal link:</p>` +
        `<p><a href="${opts.url}">${opts.url}</a></p>` +
        `<p>For your security you will be asked to confirm your family name and date of birth.</p>`,
      fromName: 'Traveller details',
    })
    return { sent: !!result.success }
  } catch (e) {
    console.error('Portal link email failed (link still valid):', e)
    return { sent: false }
  }
}
