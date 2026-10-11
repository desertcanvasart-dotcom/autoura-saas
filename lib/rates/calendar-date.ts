// ============================================
// Is this a date the calendar has?
// ============================================
// The rate CSVs checked a date's SHAPE only, so "2026-02-30" passed and then
// either failed the whole insert batch or was rolled over by the database
// to 2 March (documents audit, round 12). A date is real when it round-trips
// through Date.UTC unchanged.

/** True when year/month/day name a real calendar day (month 1-12). */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC maps years 0-99 to 1900-1999; setUTCFullYear keeps them literal.
  d.setUTCFullYear(year)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/** True for exactly YYYY-MM-DD naming a real day. */
export function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return !!m && isRealCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/**
 * False only for a value SHAPED like a date that names no real day:
 * YYYY-MM-DD (optionally followed by a time) or a slashed NN/NN/YYYY that is
 * a real day in neither the day-first nor the month-first reading. Anything
 * else is left to the caller.
 */
export function dateShapeIsReal(value: string): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value)
  if (iso) return isRealCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (slashed) {
    const a = Number(slashed[1]), b = Number(slashed[2]), y = Number(slashed[3])
    return isRealCalendarDate(y, b, a) || isRealCalendarDate(y, a, b)
  }
  return true
}
