import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { resolveAssigneeContact } from '@/lib/staff-link'
import type { PickupPerson } from '@/lib/notify/pickup-message'

// ============================================
// /api/whatsapp/send-pickup — the pickup details message
// ============================================
// GET drafts it: for one day of the trip, the pickup time and place on the
// itinerary, and who is assigned that day — guide, driver (or the vehicle's
// own driver) and car, airport representative — with their numbers
// (resolveAssigneeContact, as the staff link uses). The page builds the text
// from these (lib/notify/pickup-message) and the operator may edit it.
//
// POST sends the text to the itinerary's OWN client number — never a number
// from the request — and keeps the pickup time and place on the itinerary.

const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

type ContactClient = Parameters<typeof resolveAssigneeContact>[0]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('itineraryId')
  const date = request.nextUrl.searchParams.get('date')
  if (!id || !isDay(date)) return NextResponse.json({ success: false, error: 'itineraryId and date (YYYY-MM-DD) are required' }, { status: 400 })

  const { data: itinerary } = await supabase
    .from('itineraries').select('id, client_name, client_phone, trip_name, pickup_time, pickup_location').eq('id', id).maybeSingle()
  if (!itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

  const [{ data: days }, { data: resources }, sender] = await Promise.all([
    supabase.from('itinerary_days').select('id, day_number, date').eq('itinerary_id', id),
    supabase.from('itinerary_resources')
      .select('id, resource_type, resource_id, resource_name, itinerary_day_id, start_date, end_date, status')
      .eq('itinerary_id', id),
    loadSenderTenant(tenant_id),
  ])
  const day = (days ?? []).find(d => String(d.date ?? '').slice(0, 10) === date)

  // Who is on that day: assigned to the day itself, or a date range covering it.
  const onDay = (resources ?? []).filter(r => {
    if (String(r.status ?? '').toLowerCase() === 'cancelled') return false
    if (r.itinerary_day_id) return r.itinerary_day_id === day?.id
    const start = String(r.start_date ?? '').slice(0, 10)
    const end = String(r.end_date ?? '').slice(0, 10) || start
    return !!start && start <= date! && date! <= end
  })
  const contact = async (type: string): Promise<{ person: PickupPerson | null; name: string | null }> => {
    const r = onDay.find(x => x.resource_type === type)
    if (!r) return { person: null, name: null }
    const c = await resolveAssigneeContact(supabase as unknown as ContactClient, r)
    const name = (c?.name ?? r.resource_name ?? '').trim()
    return { person: name ? { name, phone: c?.phone ?? null } : null, name: r.resource_name ?? null }
  }
  const [guide, driver, vehicle, airport] = await Promise.all([contact('guide'), contact('driver'), contact('vehicle'), contact('airport_staff')])

  return NextResponse.json({
    success: true,
    data: {
      date,
      dayNumber: day?.day_number ?? null,
      time: itinerary.pickup_time ?? null,
      place: itinerary.pickup_location ?? null,
      guide: guide.person,
      // A driver assigned that day; else the vehicle's own driver (its contact resolves to them).
      driver: driver.person ?? vehicle.person,
      vehicle: vehicle.name,
      airport: airport.person,
      agency: sender?.company_name ?? null,
      clientName: itinerary.client_name,
      tripName: itinerary.trip_name,
      clientPhone: itinerary.client_phone ?? null,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase } = auth
  if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { itineraryId, message, pickup_time, pickup_location, send = true } = body as {
    itineraryId?: string; message?: string; pickup_time?: string | null; pickup_location?: string | null; send?: boolean
  }
  if (!itineraryId) return NextResponse.json({ success: false, error: 'itineraryId is required' }, { status: 400 })

  const { data: itinerary } = await supabase.from('itineraries').select('id, client_phone').eq('id', itineraryId).maybeSingle()
  if (!itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

  // The pickup time and place stay on the trip, sent or not.
  const { error: saveError } = await supabase
    .from('itineraries')
    .update({ pickup_time: pickup_time?.trim() || null, pickup_location: pickup_location?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', itineraryId)
  if (saveError) return NextResponse.json({ success: false, error: saveError.message }, { status: 500 })
  if (!send) return NextResponse.json({ success: true, sent: false })

  if (!message?.trim()) return NextResponse.json({ success: false, error: 'The message is empty' }, { status: 400 })
  if (!itinerary.client_phone) return NextResponse.json({ success: false, error: 'This itinerary has no client phone number' }, { status: 400 })

  const result = await sendWhatsAppMessage({ to: itinerary.client_phone, body: message.trim(), tenantId: auth.tenant_id })
  if (!result.success) return NextResponse.json({ success: false, error: result.error || 'Could not send the WhatsApp message' }, { status: 502 })
  return NextResponse.json({ success: true, sent: true, messageId: result.messageId })
}
