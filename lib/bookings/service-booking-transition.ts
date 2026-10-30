// ============================================
// Moving a service booking on — the one writer of its status
// ============================================
// Every status change goes through here: the move is checked against the
// states (service-booking-states), the row gets its time stamps, the change
// is written to the line's history (service_booking_events), and the expense
// the line records follows it (supplier-expense). The Suppliers tab, the
// supplier's reply link and the deadline job all call this — never an
// UPDATE of `status` of their own.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canTransition, isCovered, normalizeStatus, replyDeadline, type CoveredBy, type ServiceBookingStatus,
} from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent, type EventActor, type EventChannel } from '@/lib/bookings/service-booking-events'
import { syncSupplierExpense, type SupplierExpenseResult } from '@/lib/bookings/supplier-expense'

export interface TransitionInput {
  id: string
  bookingId: string
  to: ServiceBookingStatus
  actor: EventActor
  channel: EventChannel
  actorUserId?: string | null
  actorLabel?: string | null
  note?: string | null
  /** Defaults to now; passed in by tests. */
  now?: Date
}

/** When the service starts, for the reply deadline: its date, at its time when known. */
export function serviceStart(date: string | null | undefined, time: string | null | undefined): Date | null {
  if (!date) return null
  const t = /^\d{2}:\d{2}/.test(time ?? '') ? (time as string).slice(0, 5) : '00:00'
  const d = new Date(`${date.slice(0, 10)}T${t}:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Pure: the columns a move sets besides `status`. */
export function transitionStamps(
  row: { status: string | null; service_date?: string | null; service_time?: string | null },
  to: ServiceBookingStatus,
  now: Date,
): Record<string, unknown> {
  const from = normalizeStatus(row.status)
  const at = now.toISOString()
  const out: Record<string, unknown> = { status: to, updated_at: at }
  if (to === 'requested') {
    out.requested_at = at
    out.reply_deadline = replyDeadline(now, serviceStart(row.service_date, row.service_time)).toISOString()
  }
  if (isCovered(to) && !isCovered(from)) out.confirmed_at = at
  if (!isCovered(to)) out.confirmed_at = null
  if (to === 'assigned') out.assigned_at = at
  if (to === 'pending' || to === 'cancelled') { out.reply_deadline = null; out.assigned_at = null }
  return out
}

export type TransitionResult =
  | { ok: true; row: Record<string, unknown>; expense: SupplierExpenseResult }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

export async function transitionServiceBooking(
  db: SupabaseClient,
  tenantId: string,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { data: row, error: readErr } = await db
    .from('booking_supplier_status')
    .select('id, status, resource_kind, service_date, service_time')
    .eq('id', input.id)
    .eq('booking_id', input.bookingId)
    .maybeSingle()
  if (readErr) return { ok: false, status: 500, error: readErr.message }
  if (!row) return { ok: false, status: 404, error: 'Service booking not found' }

  const check = canTransition(row.status as string | null, input.to, (row.resource_kind as CoveredBy) ?? 'supplier')
  if (!check.ok) return { ok: false, status: 409, error: check.reason }

  // Only from the status just read: two moves at once cannot both win.
  const { data: updated, error } = await db
    .from('booking_supplier_status')
    .update(transitionStamps(row as { status: string | null }, input.to, input.now ?? new Date()))
    .eq('id', input.id)
    .eq('status', row.status as string)
    .select()
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!updated) return { ok: false, status: 409, error: 'Someone else changed this line just now — reload and try again' }

  const logged = await recordServiceBookingEvent(db, {
    tenantId, bookingId: input.bookingId, serviceBookingId: input.id,
    actor: input.actor, channel: input.channel, actorUserId: input.actorUserId, actorLabel: input.actorLabel,
    fromStatus: row.status as string | null, toStatus: input.to, note: input.note,
  })
  if (!logged.ok) console.error('[service-booking] event:', logged.error)

  const expense = await syncSupplierExpense(db, tenantId, input.id)
  return { ok: true, row: updated, expense }
}
