// ============================================
// A service booking's history — one event per change
// ============================================
// service_booking_events (migration 446) is append-only: who did it (the
// operator's team, the supplier through their link, or a job), how (app,
// link, whatsapp, email, system), from which status to which, and a note.
// Every status change writes one; nothing ever edits one.

import type { SupabaseClient } from '@supabase/supabase-js'

export type EventActor = 'operator' | 'supplier' | 'system'
export type EventChannel = 'app' | 'link' | 'whatsapp' | 'email' | 'system'

export interface ServiceBookingEvent {
  tenantId: string
  bookingId: string
  serviceBookingId: string
  actor: EventActor
  channel: EventChannel
  actorUserId?: string | null
  actorLabel?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  note?: string | null
  details?: Record<string, unknown>
}

/** The row to insert. Pure, so tested. */
export function eventRow(e: ServiceBookingEvent) {
  return {
    tenant_id: e.tenantId,
    booking_id: e.bookingId,
    service_booking_id: e.serviceBookingId,
    actor_kind: e.actor,
    channel: e.channel,
    actor_user_id: e.actorUserId ?? null,
    actor_label: e.actorLabel?.trim() || null,
    from_status: e.fromStatus ?? null,
    to_status: e.toStatus ?? null,
    note: e.note?.trim() || null,
    details: e.details ?? {},
  }
}

export async function recordServiceBookingEvent(
  db: SupabaseClient,
  e: ServiceBookingEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from('service_booking_events').insert(eventRow(e))
  return error ? { ok: false, error: error.message } : { ok: true }
}
