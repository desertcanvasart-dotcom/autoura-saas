import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { generateWhatsAppLink, whatsappRecipient } from '@/lib/communication-utils'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { sendMail } from '@/lib/email-send'
import { resolveSender } from '@/lib/tenant-email-domain'
import { messageEmailHtml } from '@/lib/supplier-reply-link'
import {
  CLIENT_TOLD, buildClientDayMessage, linesForDay, serviceDays, tomorrowOf, type DayLine,
} from '@/lib/bookings/client-day-message'

// ============================================
// The client's day details, pre-typed for the office's WhatsApp (D2)
// ============================================
// lib/bookings/client-day-message.
// GET                  → the booking's service days, and the one to offer
//                        (tomorrow when it has services, else the next one).
// POST { date }        → the message and the client's WhatsApp link.
// POST { date, sent }  → the office sent it: noted on each of that day's lines.

type Ctx = { params: Promise<{ id: string }> }

const LINE_COLUMNS = 'id, status, service_date, service_time, service_description, supplier_type, pickup_location, dropoff_location, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note'
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

async function loadLines(db: SupabaseClient, tenantId: string, bookingId: string) {
  const { data, error } = await db.from('booking_supplier_status').select(LINE_COLUMNS).eq('booking_id', bookingId).eq('tenant_id', tenantId)
  return { lines: (data ?? []) as DayLine[], error }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const { lines, error } = await loadLines(supabase, tenant_id, id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const days = serviceDays(lines)
  const tomorrow = tomorrowOf(new Date())
  const today = new Date().toISOString().slice(0, 10)
  const offer = days.includes(tomorrow) ? tomorrow : days.find(d => d >= today) ?? null
  return NextResponse.json({ success: true, data: { days, offer, tomorrow } })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id, user } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (!isDate(body.date)) return NextResponse.json({ success: false, error: 'Choose a day' }, { status: 400 })

  const { lines: all, error } = await loadLines(supabase, tenant_id, id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const lines = linesForDay(all, body.date)
  if (lines.length === 0) return NextResponse.json({ success: false, error: 'No services on that day' }, { status: 404 })

  // Note it on each of the day's lines (WhatsApp: the office says it sent it; email: it went).
  const noteSent = async (channel: 'whatsapp' | 'email', note: string) => {
    for (const l of lines) {
      const r = await recordServiceBookingEvent(supabase, {
        tenantId: tenant_id, bookingId: id, serviceBookingId: l.id, actor: 'operator', channel,
        actorUserId: user?.id ?? null, actorLabel: user?.email ?? null,
        note, details: { kind: CLIENT_TOLD, date: body.date },
      })
      if (!r.ok) return r.error
    }
    return null
  }

  if (body.sent === true) {
    const failed = await noteSent('whatsapp', "Client sent the day's details")
    if (failed) return NextResponse.json({ success: false, error: failed }, { status: 500 })
    return NextResponse.json({ success: true, told: true })
  }

  const { data: booking } = await supabase.from('bookings').select('itinerary_id, client_id').eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
  if (!booking) return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
  const [{ data: tenant }, { data: itinerary }, { data: client }] = await Promise.all([
    supabase.from('tenants').select('company_name, operating_country, contact_email, email_domain, email_from_local, email_domain_status').eq('id', tenant_id).maybeSingle(),
    booking.itinerary_id
      ? supabase.from('itineraries').select('client_name, client_phone, client_email').eq('id', booking.itinerary_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.client_id
      ? supabase.from('clients').select('full_name, first_name, whatsapp, phone, email').eq('id', booking.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const message = buildClientDayMessage({
    clientName: (client?.first_name || itinerary?.client_name || client?.full_name) as string | null,
    agency: tenant?.company_name as string | null,
    date: body.date,
    lines,
    isTomorrow: body.date === tomorrowOf(new Date()),
  })
  if (body.channel === 'email') {
    // The same message by email, sent now (the office pressed it).
    const to = ((client?.email || itinerary?.client_email) as string | null)?.trim()
    if (!to) return NextResponse.json({ success: false, error: 'No email for this client — add one on the client, or use WhatsApp' }, { status: 409 })
    const day = new Date(`${body.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    const sent = await sendMail({
      to,
      subject: `Your details for ${day}`,
      html: messageEmailHtml(message),
      from: resolveSender(tenant ?? {}, process.env.RESEND_FROM_EMAIL || '').from,
      ...(tenant?.contact_email ? { replyTo: tenant.contact_email as string } : {}),
    })
    if (!sent.success) return NextResponse.json({ success: false, error: sent.suppressed ? 'That address bounced before — check it on the client' : `Email not sent: ${sent.error ?? 'unknown error'}` }, { status: 502 })
    const failed = await noteSent('email', `Client emailed the day's details (${to})`)
    if (failed) return NextResponse.json({ success: false, error: failed }, { status: 500 })
    return NextResponse.json({ success: true, told: true, emailed: to })
  }

  const raw = (client?.whatsapp || itinerary?.client_phone || client?.phone) as string | null
  const { phone, warning: phoneWarning } = whatsappRecipient(raw, tenant?.operating_country as string | null)
  return NextResponse.json({
    success: true,
    data: { message, phone, phone_warning: phoneWarning, whatsapp_url: phone ? generateWhatsAppLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}` },
  })
}
