import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-server'
import { isLinkLive, isValidReplyToken, toSupplierView } from '@/lib/supplier-reply-link'
import ReplyButtons from './ReplyButtons'

// The supplier's reply page: no login, the token is the credential
// (middleware opens the path; this page 404s anything that does not resolve
// to a live link). Everything rendered goes through toSupplierView — the
// supplier sees the service they are asked for and nothing else of the trip.

export const dynamic = 'force-dynamic'

export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidReplyToken(token)) notFound()

  const db = createAdminClient()
  const { data: link } = await db
    .from('service_booking_links')
    .select('id, tenant_id, booking_id, service_booking_id, revoked_at, expires_at')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (!link || !isLinkLive(link, new Date())) notFound()

  const [{ data: line }, { data: booking }, { data: tenant }] = await Promise.all([
    db.from('booking_supplier_status')
      .select('status, supplier_type, supplier_name, service_description, service_date, service_time, pickup_location, dropoff_location, pax, reply_deadline, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note')
      .eq('id', link.service_booking_id).eq('tenant_id', link.tenant_id).maybeSingle(),
    db.from('bookings').select('itinerary_id').eq('id', link.booking_id).eq('tenant_id', link.tenant_id).maybeSingle(),
    db.from('tenants').select('company_name').eq('id', link.tenant_id).maybeSingle(),
  ])
  if (!line) notFound()
  const { data: itinerary } = booking?.itinerary_id
    ? await db.from('itineraries').select('client_name').eq('id', booking.itinerary_id).maybeSingle()
    : { data: null }

  // Best-effort: the office can see the link was opened.
  void db.from('service_booking_links').update({ last_opened_at: new Date().toISOString() }).eq('id', link.id)
    .then(({ error }) => { if (error) console.error('[reply page] opened stamp:', error.message) })

  const view = toSupplierView(
    (tenant ?? {}) as Record<string, unknown>,
    (itinerary ?? {}) as Record<string, unknown>,
    line as Record<string, unknown>,
  )
  const date = view.serviceDate
    ? new Date(`${view.serviceDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    : null

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-gray-400">Booking request from {view.operatorName}</p>
        <h1 className="text-xl font-semibold mt-1 text-white">{view.service}</h1>
        <p className="text-sm text-gray-300 mt-1">For {view.supplierName}</p>
      </header>
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <dl className="bg-white rounded-xl border border-gray-200 p-4 text-sm grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
          {date && <><dt className="text-gray-500">Date</dt><dd className="text-gray-900">{date}{view.serviceTime && ` at ${view.serviceTime}`}</dd></>}
          {view.pickup && <><dt className="text-gray-500">Pickup</dt><dd className="text-gray-900">{view.pickup}</dd></>}
          {view.dropoff && <><dt className="text-gray-500">Drop-off</dt><dd className="text-gray-900">{view.dropoff}</dd></>}
          {view.guests && <><dt className="text-gray-500">Guests</dt><dd className="text-gray-900">{view.guests}</dd></>}
          {view.clientName && <><dt className="text-gray-500">Client</dt><dd className="text-gray-900">{view.clientName}</dd></>}
        </dl>
        <ReplyButtons token={token} view={view} />
      </div>
    </main>
  )
}
