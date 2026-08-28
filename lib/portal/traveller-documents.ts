// ============================================
// Traveller document uploads — what is accepted, and where it lands (C1b)
// ============================================
// The one place that decides whether a file a stranger sent us is allowed in.
// The portal upload route is the only write path in this app that takes a
// FILE from someone with no session, so the rules live here and are tested
// directly.
//
// Three separate checks, because each catches what the others miss:
//   1. The declared MIME must be on the allowlist.
//   2. The real bytes must match that declared type (magic-byte sniff —
//      `file.type` is caller-supplied).
//   3. The stored extension comes from the VALIDATED type, never from the
//      filename: `passport.jpg.html` must not decide how the object serves.
//
// The bucket is PRIVATE (migration 301). Nothing here ever builds a public
// URL; reads are short-lived signed URLs issued behind the portal gate or a
// staff session. If you find yourself reaching for getPublicUrl on this
// bucket, stop.

import { safeKeySegment } from '@/lib/storage-key'

export const TRAVELLER_DOCS_BUCKET = 'traveller-documents'

/** 10 MB. A phone photo of a passport page is 2-5 MB; a scan is smaller. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/** Supporting documents per traveller, excluding the passport slot — a cap so
 *  "attach anything" cannot become an unbounded store of personal data. */
export const MAX_OTHER_DOCUMENTS = 6

export type DocumentKind = 'passport' | 'other'

/** Declared type → stored extension. Membership here IS the allowlist. */
export const EXT_FOR_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

export const ALLOWED_TYPES = Object.keys(EXT_FOR_TYPE)

/** The type the bytes actually are, or null. HEIC (an iPhone passport photo)
 *  is sniffed through its ISO-BMFF ftyp box. */
export function sniffType(buf: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.subarray(start, end))
  if (buf.length >= 4 && ascii(0, 4) === '%PDF') return 'application/pdf'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png'
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

export type UploadRejection = 'empty' | 'too_large' | 'type_not_allowed' | 'content_mismatch' | 'too_many'

/** Decide whether these bytes may be stored. The declared type must be on
 *  the allowlist AND agree with the bytes; the sniffed type (never the
 *  declared one) is what callers work from downstream. */
export function checkUpload(
  bytes: Uint8Array,
  declaredType: string,
  opts: { existingOtherCount?: number; kind?: DocumentKind } = {}
): { ok: true; type: string; ext: string } | { ok: false; reason: UploadRejection } {
  if (!bytes || bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'too_large' }
  if (!ALLOWED_TYPES.includes(declaredType)) return { ok: false, reason: 'type_not_allowed' }

  const sniffed = sniffType(bytes)
  if (!sniffed || sniffed !== declaredType) return { ok: false, reason: 'content_mismatch' }

  if (opts.kind === 'other' && (opts.existingOtherCount ?? 0) >= MAX_OTHER_DOCUMENTS) {
    return { ok: false, reason: 'too_many' }
  }
  return { ok: true, type: sniffed, ext: EXT_FOR_TYPE[sniffed] }
}

/** Where the object lands. Every segment sanitised even though callers pass
 *  server-side ids — the guarantee holds by construction. `unique` keeps a
 *  re-upload from colliding with an object still being read via an
 *  outstanding signed URL. */
export function documentStorageKey(args: {
  bookingId: string
  passengerId: string
  kind: DocumentKind
  ext: string
  unique: string
}): string {
  const booking = safeKeySegment(args.bookingId, 'booking')
  const passenger = safeKeySegment(args.passengerId, 'passenger')
  const kind = args.kind === 'passport' ? 'passport' : 'other'
  const unique = safeKeySegment(args.unique, 'file')
  const ext = safeKeySegment(args.ext, 'bin')
  return `${booking}/${passenger}/${kind}-${unique}.${ext}`
}

/** Retention: zero days past the trip — the purge runs the day after the
 *  booking's end date. */
export const RETENTION_DAYS_AFTER_TRIP = 0

/** When this upload becomes purgeable — stamped ONCE at upload time,
 *  deliberately never recomputed: moving a booking's dates later must not
 *  silently extend how long a passport image is kept. An undated booking
 *  still gets a horizon (a year from upload). */
export function purgeAfterFor(bookingEndDate: string | null | undefined, uploadedAt: Date): string {
  const end = bookingEndDate ? Date.parse(`${String(bookingEndDate).slice(0, 10)}T00:00:00Z`) : NaN
  const base = Number.isFinite(end) ? new Date(end) : addDays(uploadedAt, 365)
  return addDays(base, RETENTION_DAYS_AFTER_TRIP + 1).toISOString()
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

export const REJECTION_MESSAGE: Record<UploadRejection, string> = {
  empty: 'The file is empty.',
  too_large: 'The file is too large (10 MB maximum).',
  type_not_allowed: 'This format is not supported — please use PDF, JPEG, PNG, WEBP or HEIC.',
  content_mismatch: 'The file contents do not match its format. Please try a different file.',
  too_many: `You can attach up to ${MAX_OTHER_DOCUMENTS} supporting documents.`,
}
