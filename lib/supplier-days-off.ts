// ============================================
// Days a supplier cannot work (Supplier Network Phase 2A, migration 449)
// ============================================
// Marked by the supplier on their own page, or by the office on the supplier
// card. A WARNING when choosing who covers a line on that day — never a block
// (operator default, 2026-10-30): the office may still ask them.
// A supplier may remove only the days they marked; the office, any.

export const MAX_AHEAD_DAYS = 400

export interface DayOff { day: string; note: string | null; marked_by: 'supplier' | 'office' }

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A day that can be marked: a real date, today or later, within MAX_AHEAD_DAYS. */
export function checkDayOff(day: unknown, today: string): { ok: true; day: string } | { ok: false; error: string } {
  if (typeof day !== 'string' || !DATE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { ok: false, error: 'Choose a date' }
  if (day < today) return { ok: false, error: 'That day has passed' }
  const max = new Date(`${today}T00:00:00Z`)
  max.setUTCDate(max.getUTCDate() + MAX_AHEAD_DAYS)
  if (day > max.toISOString().slice(0, 10)) return { ok: false, error: 'Choose a day within the next year' }
  return { ok: true, day }
}

export function cleanNote(note: unknown): string | null {
  const s = typeof note === 'string' ? note.trim().replace(/\s+/g, ' ') : ''
  return s ? s.slice(0, 200) : null
}

/** The supplier ids (among these) that marked this day off. */
export function offOn(rows: Array<{ supplier_id: string; day: string }>, day: string | null | undefined): Set<string> {
  const d = (day ?? '').slice(0, 10)
  return new Set(d ? rows.filter(r => r.day.slice(0, 10) === d).map(r => r.supplier_id) : [])
}
