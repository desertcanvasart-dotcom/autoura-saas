// ============================================
// A supplier's answer on one line — shared by every supplier-facing page
// ============================================
// The per-request reply link (448, app/api/reply/[token]) and the supplier's
// own page (449, app/api/supplier-page/[token]/lines/[lineId]) take the
// same taps: accept, decline, or name the car's plate / the guide (+ driver
// of the day). The caller has already proved which tenant, booking and line
// the token may touch; this applies the answer: fields first, then the
// status through the one writer, as the supplier; then the office's bell.

import type { SupabaseClient } from '@supabase/supabase-js'
import { assignWhat, parseSupplierAction, targetStatus } from '@/lib/supplier-reply-link'
import { normalizeStatus, type ServiceBookingStatus } from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { notifyTeam } from '@/lib/notifications'

export interface AnswerLine {
  id: string
  status: string | null
  supplier_type: string | null
  supplier_name: string | null
  service_description: string | null
}

export type AnswerResult =
  | { ok: true; status: ServiceBookingStatus }
  | { ok: false; status: number; error: string }

export async function applySupplierAnswer(
  db: SupabaseClient,
  where: { tenantId: string; bookingId: string; line: AnswerLine; via: 'link' },
  body: unknown,
): Promise<AnswerResult> {
  const { tenantId, bookingId, line } = where
  if (normalizeStatus(line.status) === 'cancelled') {
    return { ok: false, status: 409, error: 'This service is no longer needed — thank you' }
  }
  const parsed = parseSupplierAction(body, assignWhat(line.supplier_type))
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const answer = parsed.value
  const who = { actor: 'supplier' as const, channel: where.via, actorLabel: line.supplier_name ?? 'Supplier' }

  if (answer.action === 'assign') {
    const { error } = await db.from('booking_supplier_status').update({
      assigned_vehicle_plate: answer.plate ?? null,
      assigned_guide_name: answer.guide_name ?? null,
      assigned_guide_phone: answer.guide_phone ?? null,
      driver_note: answer.driver_note ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', line.id).eq('tenant_id', tenantId)
    if (error) return { ok: false, status: 500, error: 'Could not save — please try again' }
  }

  const to = targetStatus(answer)
  const named = answer.action === 'assign' ? (answer.plate ?? answer.guide_name ?? '') : ''
  const note = answer.action === 'decline' ? (answer.reason ? `Declined: ${answer.reason}` : 'Declined')
    : answer.action === 'assign' ? `Named ${answer.plate ? `car ${answer.plate}` : `guide ${answer.guide_name}`}${answer.driver_note ? ` · driver: ${answer.driver_note}` : ''}`
    : 'Accepted'

  if (normalizeStatus(line.status) === to) {
    // Already there: a changed car or guide is still worth a history line.
    if (answer.action === 'assign') {
      await recordServiceBookingEvent(db, { tenantId, bookingId, serviceBookingId: line.id, ...who, note: `Changed: ${note}`, details: { plate: answer.plate, guide_name: answer.guide_name } })
    }
  } else {
    const moved = await transitionServiceBooking(db, tenantId, { id: line.id, bookingId, to, ...who, note })
    if (!moved.ok) {
      const msg = moved.status === 409 ? 'This request has already been answered — please contact the agency to change it' : 'Could not save — please try again'
      return { ok: false, status: moved.status, error: msg }
    }
  }

  void notifyTeam({
    tenant_id: tenantId,
    dedupe_key: `service-booking:${line.id}`,
    type: 'service_booking',
    title: `${line.supplier_name}: ${answer.action === 'decline' ? 'declined' : answer.action === 'assign' ? `named ${named}` : 'accepted'}`,
    message: String(line.service_description || line.supplier_type),
    link: `/bookings/${bookingId}?tab=suppliers&line=${line.id}`,
  }).catch(e => console.error('[supplier answer] notify:', e))

  return { ok: true, status: to }
}
