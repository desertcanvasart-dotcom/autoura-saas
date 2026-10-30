// ============================================
// Reply deadlines — the nudge, then the hand-back (Phase 1, step 5)
// ============================================
// docs/supplier-network/PLAN.md §5 step 5. A requested line has a reply
// deadline (4 h, or 1 h when the service is within 48 h — set when the office
// presses "Did you send it? Yes"). A job every 5 minutes:
//
//   halfway to the deadline, no answer → the bell says so, and its link opens
//     the line with "Remind on WhatsApp" ready (D2: a person sends it);
//   past the deadline, no answer → the line becomes No reply and goes back to
//     the office, the bell naming the next supplier to try.
//
// The job never sends anything to a supplier and never changes who covers a
// line — it only tells the office. Pure rules here; the job is
// app/api/cron/service-booking-deadlines.

import { lineService, lineSupplier } from '@/lib/bookings/service-label'

export interface WaitingLine {
  id: string
  status: string | null
  requested_at: string | null
  reply_deadline: string | null
}

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN)

/** Past its deadline with no answer. */
export function isOverdue(line: WaitingLine, now: Date): boolean {
  const deadline = t(line.reply_deadline)
  return line.status === 'requested' && !Number.isNaN(deadline) && deadline <= now.getTime()
}

/** When the "no answer yet" nudge is due: halfway from the request to the deadline. */
export function reminderAt(line: WaitingLine): Date | null {
  const from = t(line.requested_at)
  const to = t(line.reply_deadline)
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null
  return new Date(from + (to - from) / 2)
}

/** Halfway gone, not yet overdue, and nobody has reminded them since asking. */
export function reminderDue(line: WaitingLine, now: Date, remindedSinceAsking: boolean): boolean {
  if (line.status !== 'requested' || remindedSinceAsking || isOverdue(line, now)) return false
  const at = reminderAt(line)
  return at !== null && at.getTime() <= now.getTime()
}

/** Event kinds this step writes into service_booking_events.details.kind. */
export const REMINDER_DUE = 'reminder_due'
export const REMINDER_SENT = 'reminder_sent'

/** Has a reminder (the job's nudge or one the office sent) been logged since the request? */
export function remindedSince(
  events: Array<{ service_booking_id: string; occurred_at: string; details: unknown }>,
  lineId: string,
  requestedAt: string | null,
): boolean {
  const since = t(requestedAt)
  return events.some(e => {
    if (e.service_booking_id !== lineId) return false
    const kind = (e.details as { kind?: unknown } | null)?.kind
    if (kind !== REMINDER_DUE && kind !== REMINDER_SENT) return false
    return Number.isNaN(since) || t(e.occurred_at) >= since
  })
}

export interface SupplierChoice {
  supplier_id: string
  name: string
  cost: number | null
  preferred?: boolean
}

/**
 * The next supplier to try: never the one who did not answer; a starred
 * (preferred) one first, then the cheapest with a known cost, then by name.
 * None = nobody else has a rate for this service.
 */
export function pickNextSupplier(options: SupplierChoice[], notThisOne: string | null): SupplierChoice | null {
  const rest = options.filter(o => o.supplier_id !== notThisOne)
  rest.sort((a, b) =>
    Number(!!b.preferred) - Number(!!a.preferred)
    || (a.cost ?? Infinity) - (b.cost ?? Infinity)
    || a.name.localeCompare(b.name))
  return rest[0] ?? null
}

function minutesLeft(deadline: string | null, now: Date): number {
  return Math.max(0, Math.round((t(deadline) - now.getTime()) / 60_000))
}

function inWords(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

interface BellLine { supplier_name: string | null; service_description: string | null; supplier_type: string | null; reply_deadline: string | null }

const what = (l: BellLine) => lineService(l)

/** Bell text for the halfway nudge. */
export function reminderBell(line: BellLine, now: Date) {
  return {
    title: `${lineSupplier(line) ?? 'Supplier'} has not answered yet`,
    message: `${what(line)} — ${inWords(minutesLeft(line.reply_deadline, now))} left to answer. Send a reminder on WhatsApp.`,
  }
}

/** Bell text when the deadline passed. */
export function expiredBell(line: BellLine, next: SupplierChoice | null, currency: string | null) {
  const nextText = next
    ? `Next to try: ${next.name}${next.cost !== null ? ` (${currency ? `${currency} ` : ''}${next.cost.toFixed(2)})` : ' (no rate — agree the price)'}.`
    : 'Choose who covers it.'
  return {
    title: `${lineSupplier(line) ?? 'Supplier'}: no reply in time`,
    message: `${what(line)} — ${nextText}`,
  }
}

/** Where the bell opens: the booking's Suppliers tab, on this line. */
export function lineLink(bookingId: string, lineId: string): string {
  return `/bookings/${bookingId}?tab=suppliers&line=${lineId}`
}
