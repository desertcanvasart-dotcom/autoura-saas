import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidReplyToken, isLinkLive, assignWhat, parseSupplierAction, targetStatus } from '@/lib/supplier-reply-link'
import { normalizeStatus } from '@/lib/bookings/service-booking-states'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { notifyTeam } from '@/lib/notifications'

/**
 * The supplier's tap (lib/supplier-reply-link). Token-authenticated — the
 * supplier has no login — and on the middleware self-auth allowlist. The
 * token resolves to one live link on one service booking; tenant, booking and
 * line all come from that row, so the body can only say the ANSWER: accept,
 * decline, or the car's plate / the guide (+ an optional driver note).
 * The status moves through the one writer (service-booking-transition), as
 * the supplier, by link; the office is told in the bell.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidReplyToken(token)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    const db = createAdminClient()

    const { data: link } = await db
      .from('service_booking_links')
      .select('id, tenant_id, booking_id, service_booking_id, revoked_at, expires_at')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link || !isLinkLive(link, new Date())) {
      return NextResponse.json({ success: false, error: 'This link has expired — please contact the agency' }, { status: 404 })
    }

    const { data: line } = await db
      .from('booking_supplier_status')
      .select('id, status, supplier_type, supplier_name, service_description, assigned_vehicle_plate, assigned_guide_name')
      .eq('id', link.service_booking_id)
      .eq('tenant_id', link.tenant_id)
      .maybeSingle()
    if (!line) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (normalizeStatus(line.status) === 'cancelled') {
      return NextResponse.json({ success: false, error: 'This service is no longer needed — thank you' }, { status: 409 })
    }

    const parsed = parseSupplierAction(await request.json().catch(() => ({})), assignWhat(line.supplier_type))
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const answer = parsed.value
    const who = { actor: 'supplier' as const, channel: 'link' as const, actorLabel: line.supplier_name as string }

    if (answer.action === 'assign') {
      const { error } = await db.from('booking_supplier_status').update({
        assigned_vehicle_plate: answer.plate ?? null,
        assigned_guide_name: answer.guide_name ?? null,
        assigned_guide_phone: answer.guide_phone ?? null,
        driver_note: answer.driver_note ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', line.id).eq('tenant_id', link.tenant_id)
      if (error) return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
    }

    const to = targetStatus(answer)
    const named = answer.action === 'assign' ? (answer.plate ?? answer.guide_name ?? '') : ''
    const note = answer.action === 'decline' ? (answer.reason ? `Declined: ${answer.reason}` : 'Declined')
      : answer.action === 'assign' ? `Named ${answer.plate ? `car ${answer.plate}` : `guide ${answer.guide_name}`}${answer.driver_note ? ` · driver: ${answer.driver_note}` : ''}`
      : 'Accepted'

    if (normalizeStatus(line.status) === to) {
      // Already there: a changed car or guide is still worth a history line.
      if (answer.action === 'assign') {
        await recordServiceBookingEvent(db, { tenantId: link.tenant_id, bookingId: link.booking_id, serviceBookingId: line.id, ...who, note: `Changed: ${note}`, details: { plate: answer.plate, guide_name: answer.guide_name } })
      }
    } else {
      const moved = await transitionServiceBooking(db, link.tenant_id, {
        id: line.id, bookingId: link.booking_id, to, ...who, note,
      })
      if (!moved.ok) {
        const msg = moved.status === 409 ? 'This request has already been answered — please contact the agency to change it' : 'Could not save — please try again'
        return NextResponse.json({ success: false, error: msg }, { status: moved.status })
      }
    }

    void notifyTeam({
      tenant_id: link.tenant_id,
      dedupe_key: `service-booking:${line.id}`,
      type: 'service_booking',
      title: `${line.supplier_name}: ${answer.action === 'decline' ? 'declined' : answer.action === 'assign' ? `named ${named}` : 'accepted'}`,
      message: String(line.service_description || line.supplier_type),
      link: `/bookings/${link.booking_id}`,
    }).catch(e => console.error('[reply] notify:', e))

    return NextResponse.json({ success: true, status: to })
  } catch (error) {
    console.error('[reply] error:', error)
    return NextResponse.json({ success: false, error: 'Could not save — please try again' }, { status: 500 })
  }
}
