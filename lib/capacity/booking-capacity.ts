// ============================================
// Does a booking fit the Capacity Calendar?
// ============================================
// The calendar (Settings → Capacity) held a maximum number of groups per day,
// but nothing read it when a booking was made: "booked" was a number someone
// typed, and a full or closed day took bookings like any other. Now:
//
//   * a day's groups = the live bookings on the ground that day (start to end
//     date, statuses that still run) + the day's typed "booked" count, which
//     now means groups booked OUTSIDE Autoura;
//   * its limit = the day's own maximum, else the company's default
//     (tenants.default_max_groups_per_day, migration 417); no default and no
//     row = no limit, so a company that never used the calendar is unchanged;
//   * a closed (blackout) day takes no booking.
//
// A booking that would go over is refused with the days named; a manager or
// admin can book it anyway (override). The WhatsApp agent's availability
// answer (/api/capacity/check) counts the same way.

import { capacityDateRange } from '@/lib/capacity/capacity-write'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { LIVE_BOOKING_STATUSES } from '@/lib/dashboard-metrics'

export interface CapacityDayRow {
  date: string
  status?: string | null
  max_groups?: number | null
  booked_groups?: number | null
  reason?: string | null
}

export interface BookingSpan {
  start_date: string | null
  end_date: string | null
}

export interface DayLoad {
  date: string
  status: string
  /** Groups on that day: live bookings plus those booked outside Autoura. */
  booked: number
  /** The day's limit, or null for none. */
  max: number | null
  reason?: string | null
}

export interface CapacityProblem {
  date: string
  why: 'closed' | 'full'
  booked: number
  max: number | null
  reason?: string | null
}

/** Each day's load across [start, end], from the calendar rows and the bookings. Pure. */
export function dayLoads(
  start: string,
  end: string,
  rows: readonly CapacityDayRow[],
  bookings: readonly BookingSpan[],
  defaultMax: number | null,
): DayLoad[] {
  const days = capacityDateRange(start, end, 400) ?? []
  const byDate = new Map(rows.map(r => [String(r.date).slice(0, 10), r]))
  return days.map(date => {
    const row = byDate.get(date)
    const onGround = bookings.filter(b => {
      const s = String(b.start_date ?? '').slice(0, 10)
      if (!s) return false
      const e = String(b.end_date ?? '').slice(0, 10) || s
      return s <= date && date <= e
    }).length
    return {
      date,
      status: row?.status ?? 'available',
      booked: onGround + Math.max(0, Number(row?.booked_groups ?? 0) || 0),
      max: row?.max_groups != null ? Number(row.max_groups) : defaultMax,
      reason: row?.reason ?? null,
    }
  })
}

/** The days a NEW group would not fit on. Pure. */
export function capacityProblems(loads: readonly DayLoad[]): CapacityProblem[] {
  const out: CapacityProblem[] = []
  for (const d of loads) {
    if (d.status === 'blackout') out.push({ date: d.date, why: 'closed', booked: d.booked, max: d.max, reason: d.reason })
    else if (d.max != null && d.booked + 1 > d.max) out.push({ date: d.date, why: 'full', booked: d.booked, max: d.max, reason: d.reason })
  }
  return out
}

/** One line for the operator: "Full on 12 Mar (3 of 3 groups); closed on 13 Mar (Eid)". */
export function describeCapacityProblems(problems: readonly CapacityProblem[]): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return problems.slice(0, 5).map(p => p.why === 'closed'
    ? `closed on ${fmt(p.date)}${p.reason ? ` (${p.reason})` : ''}`
    : `full on ${fmt(p.date)} (${p.booked} of ${p.max} groups)`
  ).join('; ') + (problems.length > 5 ? `; and ${problems.length - 5} more day(s)` : '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/**
 * Each day's load for a trip, read from the database. `excludeBookingId`
 * leaves out a booking being moved, so it does not count against itself.
 */
export async function loadDayLoads(
  db: Db,
  tenantId: string,
  start: string,
  end: string | null,
  excludeBookingId?: string | null,
): Promise<{ loads: DayLoad[]; error: string | null }> {
  const last = (end && end >= start ? end : start).slice(0, 10)
  const first = start.slice(0, 10)

  const [{ data: tenant }, rowsRes, bookingsRes] = await Promise.all([
    db.from('tenants').select('default_max_groups_per_day').eq('id', tenantId).maybeSingle(),
    db.from('operator_capacity')
      .select('date, status, max_groups, booked_groups, reason')
      .eq('tenant_id', tenantId)
      .gte('date', first)
      .lte('date', last),
    fetchAllPages<BookingSpan & { id: string }, { message?: string }>((from, to) =>
      db.from('bookings')
        .select('id, start_date, end_date')
        .eq('tenant_id', tenantId)
        .in('status', LIVE_BOOKING_STATUSES as unknown as string[])
        .lte('start_date', last)
        .order('id')
        .range(from, to)),
  ])
  if (rowsRes.error) return { loads: [], error: rowsRes.error.message ?? 'capacity could not be read' }
  if (bookingsRes.error) return { loads: [], error: bookingsRes.error.message ?? 'bookings could not be read' }

  const raw = (tenant as { default_max_groups_per_day?: number | null } | null)?.default_max_groups_per_day
  const defaultMax = raw == null ? null : Number(raw)
  const bookings = (bookingsRes.data ?? []).filter(b => b.id !== excludeBookingId)
  return { loads: dayLoads(first, last, (rowsRes.data ?? []) as CapacityDayRow[], bookings, defaultMax), error: null }
}

/** The days a new booking over [start, end] would not fit on (empty = fits). */
export async function bookingCapacityProblems(
  db: Db,
  tenantId: string,
  start: string | null | undefined,
  end: string | null | undefined,
  excludeBookingId?: string | null,
): Promise<CapacityProblem[]> {
  if (!start) return []
  const { loads, error } = await loadDayLoads(db, tenantId, start, end ?? null, excludeBookingId)
  // A calendar that cannot be read must not stop the business: log it and
  // let the booking through rather than refuse on a guess.
  if (error) {
    console.error('bookingCapacityProblems:', error)
    return []
  }
  return capacityProblems(loads)
}
