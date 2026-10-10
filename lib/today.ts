// ============================================
// "TODAY", IN THE TIMEZONE THE USER IS STANDING IN
// ============================================
// `new Date().toISOString().split('T')[0]` is the idiom this codebase reached
// for, and it is wrong by up to a day. toISOString() converts to UTC first, so
// in Tokyo (UTC+9) every moment before 09:00 local reports YESTERDAY, and in
// Cairo (UTC+2/+3) every moment before 02:00 does.
//
// That is what the 29 Aug QA audit saw as "date fields across forms default to
// yesterday" (AUT-W04): expenses, commissions, payments and the auto invoice
// issue date all defaulted to 28 August on the 29th. For an operator in Japan
// that is most of the working morning, and it lands on financial records.
//
// This formats from the LOCAL calendar fields, which is what a date input
// means by a date: no instant, no zone, just the day the user is having.
//
// todayLocal is ONLY CORRECT IN THE BROWSER. On the server `new Date()` is
// the host's clock — UTC on Railway — and "local" there is the datacentre's
// timezone, not the operator's. Server-side dates use the company's timezone
// (tenants.timezone, Settings → Organization) through todayInTimeZone /
// lib/tenant-today.

/** Today as YYYY-MM-DD in the runtime's local timezone. */
export function todayLocal(date: Date = new Date()): string {
  return toLocalDateString(date)
}

/** Any Date as YYYY-MM-DD in the runtime's local timezone. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Today as YYYY-MM-DD in a named IANA timezone — safe on the server, where the
 * host clock is UTC. Falls back to the UTC date for a missing or unknown zone.
 */
export function todayInTimeZone(timeZone: string | null | undefined, date: Date = new Date()): string {
  if (!timeZone) return date.toISOString().slice(0, 10)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** A YYYY-MM-DD date moved by whole days (calendar arithmetic, no time zone). */
export function shiftDateISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** First and last day (YYYY-MM-DD) of the month a YYYY-MM-DD date is in. */
export function monthBounds(iso: string): { start: string; end: string } {
  const [y, m] = iso.slice(0, 10).split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}
