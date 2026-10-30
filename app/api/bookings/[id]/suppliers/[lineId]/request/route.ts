import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { appRedirectBase } from '@/lib/oauth-config'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/communication-utils'
import {
  assignWhat, buildServiceRequestMessage, generateReplyToken, replyLinkExpiry,
} from '@/lib/supplier-reply-link'
import { REPLY_HOURS, REPLY_HOURS_SOON, SOON_HOURS, normalizeStatus } from '@/lib/bookings/service-booking-states'
import { serviceStart, transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { REMINDER_SENT } from '@/lib/bookings/service-booking-deadlines'

// ============================================
// Ask a supplier for one service line (lib/supplier-reply-link)
// ============================================
// POST {}            → the supplier's reply link (made once, reused) and the
//                       message, pre-typed for the office's OWN WhatsApp (D2:
//                       wa.me — our API never sends). Nothing changes yet.
// POST { sent: true } → the office says it pressed send: the line becomes
//                       Requested (with its reply deadline), or — when it was
//                       already requested — a reminder is noted.

type Ctx = { params: Promise<{ id: string; lineId: string }> }

const ASKABLE = ['pending', 'requested', 'declined', 'expired']

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
    .select('id, status, resource_kind, supplier_id, supplier_name, supplier_type, service_description, service_date, service_time, pickup_location, dropoff_location, pax, contact_phone')
    .eq('id', lineId)
    .eq('booking_id', id)
    .maybeSingle()
  if (!line) return NextResponse.json({ success: false, error: 'Service booking not found' }, { status: 404 })
  if (line.resource_kind === 'own') {
    return NextResponse.json({ success: false, error: 'This line is covered by your own team — nothing to request' }, { status: 409 })
  }
  const status = normalizeStatus(line.status)
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

  const [{ data: tenant }, { data: supplier }, { data: booking }] = await Promise.all([
    supabase.from('tenants').select('company_name, operating_country').eq('id', tenant_id).maybeSingle(),
    line.supplier_id
      ? supabase.from('suppliers').select('whatsapp, phone, contact_phone').eq('id', line.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('bookings').select('itinerary_id').eq('id', id).maybeSingle(),
  ])
  const { data: itinerary } = booking?.itinerary_id
    ? await supabase.from('itineraries').select('client_name').eq('id', booking.itinerary_id).maybeSingle()
    : { data: null }

  const start = serviceStart(line.service_date as string | null, line.service_time as string | null)
  const soon = start !== null && start.getTime() - Date.now() <= SOON_HOURS * 3_600_000
  const message = buildServiceRequestMessage({
    supplierName: line.supplier_name as string,
    agency: tenant?.company_name as string | null,
    service: (line.service_description || line.supplier_type) as string,
    serviceDate: line.service_date as string | null,
    serviceTime: line.service_time as string | null,
    pickup: line.pickup_location as string | null,
    dropoff: line.dropoff_location as string | null,
    guests: line.pax as number | null,
    clientName: itinerary?.client_name as string | null,
    replyHours: soon ? REPLY_HOURS_SOON : REPLY_HOURS,
    assign: assignWhat(line.supplier_type as string),
    url,
  })

  const rawPhone = (supplier?.whatsapp || supplier?.phone || supplier?.contact_phone || line.contact_phone) as string | null
  const phone = rawPhone ? formatPhoneForWhatsApp(rawPhone, tenant?.operating_country as string | null) : null
  return NextResponse.json({
    success: true,
    data: {
      url,
      message,
      phone,
      whatsapp_url: phone ? generateWhatsAppLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`,
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
