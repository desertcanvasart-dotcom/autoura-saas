// ============================================================================
// Which days a Nile sailing departs on
// ============================================================================
// Operator, 2026-09-19: "most of my cruises have a fixed starting day — add it
// to the form so people have more data about the cruise, and if it gets chosen
// for an itinerary that doesn't match the day it will alarm the user."
//
// A ship that leaves Aswan only on Mondays and Fridays cannot serve a Wednesday
// itinerary. Nothing in the system knew that, so the quote looked right, the
// arithmetic was right, and the booking was impossible — the worst shape a
// defect takes here, because nothing looks wrong until someone tries to book.
//
// EMPTY MEANS NO FIXED DAY, and is the default: most rows never carry one, and
// a rate that has never said otherwise must not start failing. Stored as
// weekday KEYS ('mon'…'sun'), not numbers — a number is a different day
// depending on whether the week starts on Sunday, and this data travels between
// installs. Pure and import-free, so the rule is tested without a database.

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type SailingDay = (typeof DAY_KEYS)[number]
export const SAILING_DAYS: readonly SailingDay[] = DAY_KEYS

const DAY_NAMES: Record<SailingDay, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}
/** Date.getUTCDay() is 0=Sunday. */
const BY_INDEX: readonly SailingDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const dayName = (d: SailingDay): string => DAY_NAMES[d]

export const isSailingDay = (v: unknown): v is SailingDay =>
  typeof v === 'string' && (DAY_KEYS as readonly string[]).includes(v)

/** The stored list, cleaned: known keys only, in week order, no repeats. An
 *  empty result means "no fixed day" — the ship sails whenever. */
export function sanitizeSailingDays(input: unknown): SailingDay[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<SailingDay>()
  for (const v of input) if (isSailingDay(v)) seen.add(v)
  return DAY_KEYS.filter(d => seen.has(d))
}

/** The weekday an ISO date falls on, or null when it is not a date. */
export function dayOfDate(iso: string | null | undefined): SailingDay | null {
  const s = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) ? null : BY_INDEX[new Date(t).getUTCDay()]
}

/**
 * Whether this sailing can start on this date.
 *
 * TRUE when the ship has no fixed day — most do not, and a rate that has never
 * said otherwise must not start failing. TRUE when there is no date to check.
 * Only a date that lands outside a list the operator actually entered is false.
 */
export function sailsOn(days: unknown, date: string | null | undefined): boolean {
  const list = sanitizeSailingDays(days)
  if (list.length === 0) return true
  const day = dayOfDate(date)
  if (!day) return true
  return list.includes(day)
}

/** "Mondays and Fridays" / "Mondays, Wednesdays and Fridays". */
export function sailingDaysLabel(days: unknown): string {
  const list = sanitizeSailingDays(days).map(d => `${DAY_NAMES[d]}s`)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

// ============================================================================
// The same check for a built B2C itinerary (which the day engine never runs):
// each cruise segment's first day carries its own DATE, and a service line on
// it points at the nile_cruises row (rate_table 'nile_cruises', rate_id). A
// note when that date's weekday is not one the ship sails — never a blocker.
// ============================================================================

export interface ItineraryCruiseDay {
  day_number?: number | null
  date?: string | null
  accommodation_type?: string | null
  is_cruise_day?: boolean | null
  itinerary_services?: Array<{ rate_table?: string | null; rate_id?: string | null }> | null
}
export interface CruiseShip { ship_name?: string | null; sailing_days?: unknown }

const isCruiseDay = (d: ItineraryCruiseDay): boolean =>
  d.accommodation_type === 'cruise' || d.is_cruise_day === true

/** One note per cruise segment whose boarding date does not match the ship's
 *  sailing days. Empty when every sailing fits, or none has a fixed day. */
export function cruiseSailingNotes(days: ItineraryCruiseDay[], shipByRateId: Map<string, CruiseShip>): string[] {
  const sorted = [...days].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))
  const notes: string[] = []
  let i = 0
  while (i < sorted.length) {
    if (!isCruiseDay(sorted[i])) { i++; continue }
    const seg: ItineraryCruiseDay[] = []
    while (i < sorted.length && isCruiseDay(sorted[i])) { seg.push(sorted[i]); i++ }
    const first = seg[0]
    // The ship for this segment: a nile_cruises rate on any of its days.
    let rateId: string | null = null
    for (const d of seg) {
      const svc = (d.itinerary_services ?? []).find(s => s.rate_table === 'nile_cruises' && s.rate_id)
      if (svc?.rate_id) { rateId = svc.rate_id; break }
    }
    if (!rateId) continue
    const ship = shipByRateId.get(rateId)
    if (!ship || sailsOn(ship.sailing_days, first.date)) continue
    notes.push(
      `${ship.ship_name || 'The cruise'} departs ${sailingDaysLabel(ship.sailing_days)}, but day ${first.day_number ?? '?'} boards on ${String(first.date).slice(0, 10)}. ` +
      'Move the cruise day, or pick a sailing that leaves then.'
    )
  }
  return notes
}
