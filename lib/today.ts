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
// ONLY CORRECT IN THE BROWSER. On the server `new Date()` is the host's clock
// — UTC on Railway — and "local" there is not the operator's timezone but the
// datacentre's. Server-side defaults need an organisation timezone, which this
// app does not model yet; those sites are deliberately left alone.

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
