import { NextRequest, NextResponse } from 'next/server'
import { lineService, lineSupplier } from '@/lib/bookings/service-label'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { appRedirectBase } from '@/lib/oauth-config'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/communication-utils'
import {
  assignWhat, buildServiceCancelMessage, buildServiceRequestMessage, generateReplyToken, replyLinkExpiry,
  requestEmailHtml, requestEmailSubject,
} from '@/lib/supplier-reply-link'
import { REPLY_HOURS, REPLY_HOURS_SOON, SOON_HOURS, normalizeStatus } from '@/lib/bookings/service-booking-states'
import { serviceStart, transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { REMINDER_SENT } from '@/lib/bookings/service-booking-deadlines'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from '@/lib/email-send'
import { resolveSender } from '@/lib/tenant-email-domain'

// ============================================
// Ask a supplier for one service line (lib/supplier-reply-link)
// ============================================
// POST {}            → the supplier's reply link (made once, reused) and the
//                       message, pre-typed for the office's OWN WhatsApp (D2:
//                       wa.me — our API never sends). Nothing changes yet.
// POST { sent: true } → the office says it pressed send: the line becomes
//                       Requested (with its reply deadline), or — when it was
//                       already requested — a reminder is noted.
// POST { channel: 'email' } → the same request (or reminder) sent by email
//                       now, through Resend, from the company's sender; the
//                       line becomes Requested once it has gone.
// POST { notice: 'cancelled' } (+ sent: true) → the same for telling a supplier
//                       who was asked that the line is no longer needed.

type Ctx = { params: Promise<{ id: string; lineId: string }> }

const ASKABLE = ['pending', 'requested', 'declined', 'expired']

/** The supplier's WhatsApp number in international form, or null. */
async function supplierPhone(db: SupabaseClient, supplierId: string | null, linePhone: string | null, country: string | null) {
  const { data: supplier } = supplierId
    ? await db.from('suppliers').select('whatsapp, phone, contact_phone').eq('id', supplierId).maybeSingle()
    : { data: null }
  const raw = (supplier?.whatsapp || supplier?.phone || supplier?.contact_phone || linePhone) as string | null
  return raw ? formatPhoneForWhatsApp(raw, country) : null
}

const waUrl = (phone: string | null, message: string) =>
  phone ? generateWhatsAppLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id, lineId } = await params
  const body = await request.json().catch(() => ({}))

  const { data: line } = await supabase
    .from('booking_supplier_status')
    .select('id, status, resource_kind, supplier_id, supplier_name, supplier_type, service_description, service_date, service_time, pickup_location, dropoff_location, pax, contact_phone, contact_email, requested_at')
    .eq('id', lineId)
    .eq('booking_id', id)
    .maybeSingle()
  if (!line) return NextResponse.json({ success: false, error: 'Service booking not found' }, { status: 404 })
  if (line.resource_kind === 'own') {
    return NextResponse.json({ success: false, error: 'This line is covered by your own team — nothing to request' }, { status: 409 })
  }
  const status = normalizeStatus(line.status)

  if (body.notice === 'cancelled') {
    if (status !== 'cancelled' || !line.requested_at) {
      return NextResponse.json({ success: false, error: 'Only a line that was asked and is now Not needed has a supplier to tell' }, { status: 409 })
    }
    if (body.sent === true) {
      await recordServiceBookingEvent(supabase, {
        tenantId: tenant_id, bookingId: id, serviceBookingId: line.id, actor: 'operator', channel: 'whatsapp',
        actorUserId: user?.id ?? null, actorLabel: user?.email ?? null,
        note: 'Told the supplier it is not needed', details: { kind: 'cancel_sent' },
      })
      return NextResponse.json({ success: true, told: true })
    }
    const { data: tenant } = await supabase.from('tenants').select('company_name, operating_country').eq('id', tenant_id).maybeSingle()
    const message = buildServiceCancelMessage({
      supplierName: lineSupplier(line as { supplier_name: string | null }),
      agency: tenant?.company_name as string | null,
      service: lineService(line as { service_description: string | null; supplier_type: string | null }),
      serviceDate: line.service_date as string | null,
      serviceTime: line.service_time as string | null,
    })
    const phone = await supplierPhone(supabase, line.supplier_id as string | null, line.contact_phone as string | null, tenant?.operating_country as string | null)
    return NextResponse.json({ success: true, data: { message, phone, whatsapp_url: waUrl(phone, message) } })
  }

  if (!line.supplier_id && !lineSupplier(line as { supplier_name: string | null })) {
    return NextResponse.json({ success: false, error: 'Choose who covers this line first (Who covers it)' }, { status: 409 })
  }
  if (!ASKABLE.includes(status)) {
    return NextResponse.json({ success: false, error: 'This line has already been answered' }, { status: 409 })
  }

  if (body.sent === true) {
    const actor = { actor: 'operator' as const, channel: 'whatsapp' as const, actorUserId: user?.id ?? null, actorLabel: user?.email ?? null }
    if (status === 'requested') {
      await recordServiceBookingEvent(supabase, { tenantId: tenant_id, bookingId: id, serviceBookingId: line.id, ...actor, note: 'Reminder sent', details: { kind: REMINDER_SENT } })
      return NextResponse.json({ success: true, reminded: true })
    }
    const moved = await transitionServiceBooking(supabase, tenant_id, {
      id: line.id, bookingId: id, to: 'requested', ...actor, note: `Requested from ${line.supplier_name}`,
    })
    if (!moved.ok) return NextResponse.json({ success: false, error: moved.error }, { status: moved.status })
    return NextResponse.json({ success: true, data: moved.row })
  }

  // The link: one active per line (uq_service_booking_links_active).
  let token: string | null = null
  const { data: existing } = await supabase
    .from('service_booking_links').select('token').eq('service_booking_id', line.id).is('revoked_at', null).maybeSingle()
  token = (existing?.token as string | undefined) ?? null
  if (!token) {
    const fresh = generateReplyToken()
    const { error } = await supabase.from('service_booking_links').insert({
      tenant_id, booking_id: id, service_booking_id: line.id, token: fresh,
      created_by: user?.id ?? null, expires_at: replyLinkExpiry(line.service_date as string | null),
    })
    if (error) {
      // Two clicks at once: the other one made it.
      const { data: raced } = await supabase
        .from('service_booking_links').select('token').eq('service_booking_id', line.id).is('revoked_at', null).maybeSingle()
      if (!raced) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      token = raced.token as string
    } else {
      token = fresh
    }
  }
  const url = `${appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)}/reply/${token}`

  const [{ data: tenant }, { data: booking }] = await Promise.all([
    supabase.from('tenants').select('company_name, operating_country, contact_email, email_domain, email_from_local, email_domain_status').eq('id', tenant_id).maybeSingle(),
    supabase.from('bookings').select('itinerary_id').eq('id', id).maybeSingle(),
  ])
  const { data: itinerary } = booking?.itinerary_id
    ? await supabase.from('itineraries').select('client_name').eq('id', booking.itinerary_id).maybeSingle()
    : { data: null }

  // The supplier's own page, when the office has sent them one (449).
  const { data: page } = line.supplier_id
    ? await supabase.from('supplier_portal_links').select('token').eq('tenant_id', tenant_id).eq('supplier_id', line.supplier_id).is('revoked_at', null).maybeSingle()
    : { data: null }
  const pageUrl = page?.token ? `${appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)}/supplier/${page.token}` : null

  const start = serviceStart(line.service_date as string | null, line.service_time as string | null)
  const soon = start !== null && start.getTime() - Date.now() <= SOON_HOURS * 3_600_000
  const message = buildServiceRequestMessage({
    supplierName: lineSupplier(line as { supplier_name: string | null }),
    agency: tenant?.company_name as string | null,
    service: lineService(line as { service_description: string | null; supplier_type: string | null }),
    serviceDate: line.service_date as string | null,
    serviceTime: line.service_time as string | null,
    pickup: line.pickup_location as string | null,
    dropoff: line.dropoff_location as string | null,
    guests: line.pax as number | null,
    clientName: itinerary?.client_name as string | null,
    replyHours: soon ? REPLY_HOURS_SOON : REPLY_HOURS,
    assign: assignWhat(line.supplier_type as string),
    url,
    pageUrl,
  })

  if (body.channel === 'email') {
    const { data: supplierRow } = line.supplier_id
      ? await supabase.from('suppliers').select('email, contact_email').eq('id', line.supplier_id).eq('tenant_id', tenant_id).maybeSingle()
      : { data: null }
    const to = ((supplierRow?.email || supplierRow?.contact_email || line.contact_email) as string | null)?.trim()
    if (!to) return NextResponse.json({ success: false, error: 'No email address for this supplier — add one on the supplier, or use WhatsApp' }, { status: 409 })
    const reminder = status === 'requested'
    const sent = await sendMail({
      to,
      subject: requestEmailSubject(lineService(line as { service_description: string | null; supplier_type: string | null }), line.service_date as string | null, reminder),
      html: requestEmailHtml(message, url),
      from: resolveSender(tenant ?? {}, process.env.RESEND_FROM_EMAIL || '').from,
      ...(tenant?.contact_email ? { replyTo: tenant.contact_email as string } : {}),
    })
    if (!sent.success) {
      return NextResponse.json({ success: false, error: sent.suppressed ? 'That address bounced before — check it on the supplier' : `Email not sent: ${sent.error ?? 'unknown error'}` }, { status: 502 })
    }
    const actor = { actor: 'operator' as const, channel: 'email' as const, actorUserId: user?.id ?? null, actorLabel: user?.email ?? null }
    if (reminder) {
      await recordServiceBookingEvent(supabase, { tenantId: tenant_id, bookingId: id, serviceBookingId: line.id, ...actor, note: `Reminder emailed to ${to}`, details: { kind: REMINDER_SENT } })
      return NextResponse.json({ success: true, reminded: true, emailed: to })
    }
    const moved = await transitionServiceBooking(supabase, tenant_id, {
      id: line.id, bookingId: id, to: 'requested', ...actor, note: `Requested from ${line.supplier_name} by email (${to})`,
    })
    if (!moved.ok) return NextResponse.json({ success: false, error: moved.error }, { status: moved.status })
    return NextResponse.json({ success: true, emailed: to, data: moved.row })
  }

  const phone = await supplierPhone(supabase, line.supplier_id as string | null, line.contact_phone as string | null, tenant?.operating_country as string | null)
  return NextResponse.json({
    success: true,
    data: {
      url,
      message,
      phone,
      whatsapp_url: waUrl(phone, message),
      already_requested: status === 'requested',
    },
  })
}

/** Revoke the line's reply link (the supplier's URL stops working). */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { id, lineId } = await params
  const { error } = await auth.supabase!
    .from('service_booking_links').update({ revoked_at: new Date().toISOString() })
    .eq('service_booking_id', lineId).eq('booking_id', id).is('revoked_at', null)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
