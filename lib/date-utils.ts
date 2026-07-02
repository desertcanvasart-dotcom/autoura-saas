/**
 * Date-only formatting helpers.
 *
 * The bug this fixes: `new Date('2026-06-15')` parses a bare YYYY-MM-DD string
 * as UTC midnight. Formatting that in a timezone west of UTC (e.g. the
 * Americas) renders it as the PREVIOUS day — vouchers, invoices and contracts
 * would show check-in/travel dates off by one.
 *
 * A calendar date like a hotel check-in has no time zone — "15 June" means the
 * 15th everywhere. So we parse the Y-M-D parts into LOCAL midnight, which never
 * shifts across the date line regardless of the server/runtime timezone.
 *
 * Full timestamps (created_at, `new Date().toISOString()`) are genuine instants
 * and must NOT go through here — format those normally.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a date value into a Date that represents the intended calendar day.
 * Bare YYYY-MM-DD strings become LOCAL midnight (no UTC shift); anything else
 * (full ISO timestamps, Date objects, epoch millis) is passed to `new Date`
 * unchanged. Returns null for empty/invalid input.
 */
export function parseDateOnly(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'string') {
    const m = value.match(DATE_ONLY_RE)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return isNaN(d.getTime()) ? null : d
    }
  }

  const d = new Date(value as any)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Format a calendar date for display, immune to the UTC-parse off-by-one.
 * Falls back to the original string (or '') when the value can't be parsed.
 */
export function formatDateOnly(
  value: string | number | Date | null | undefined,
  locale: string = 'en-GB',
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const d = parseDateOnly(value)
  if (!d) return typeof value === 'string' ? value : ''
  return d.toLocaleDateString(locale, options)
}

/**
 * Whole-day difference between two calendar dates (end - start), TZ-safe.
 * Returns 0 when either date is unparseable.
 */
export function daysBetween(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined
): number {
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  if (!s || !e) return 0
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
}
