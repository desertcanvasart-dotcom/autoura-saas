// ============================================
// SAFE OBJECT-STORAGE KEYS (C1b, ported from the reference implementation)
// ============================================
// Storage keys in this app are built by interpolating ids, document numbers
// or filename fragments into templates. When a value comes from a request
// body it decides where the object lands — and some buckets are public, so an
// object written to an unexpected key is world-readable. One sanitiser,
// applied at every interpolation, so the guarantee holds by construction.

/**
 * Reduce one interpolated value to a single safe path SEGMENT: keeps the
 * characters real ids actually use (a-z A-Z 0-9 . _ -), drops everything
 * else — no `/` to nest somewhere unexpected, no `..` to climb.
 * A legitimate value (a UUID, INV-2026-0001) passes through untouched.
 */
export function safeKeySegment(value: unknown, fallback = 'unknown'): string {
  const raw = String(value ?? '')
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
  const capped = cleaned.slice(0, 100)
  return capped || fallback
}
