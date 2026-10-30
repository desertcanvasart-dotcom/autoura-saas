import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidSupplierPageToken, portalSections, toPortalLine, type PortalLine, type PortalSourceLine } from '@/lib/supplier-portal'
import type { SupplierView } from '@/lib/supplier-reply-link'
import ReplyButtons from '@/app/reply/[token]/ReplyButtons'
import DaysOffEditor from '@/components/DaysOffEditor'
import type { DayOff } from '@/lib/supplier-days-off'
import { OWED_LABEL, owedView, type OwedSource } from '@/lib/supplier-owed'

// A supplier's own page from one agency (migration 449): no login, the token
// is the credential (middleware opens /supplier; this page 404s anything that
// does not resolve to an unrevoked link). Requests to answer, upcoming jobs
// (change the car or driver up to the day), and done jobs. Everything shown
// goes through toPortalLine.

export const dynamic = 'force-dynamic'

const COLUMNS = 'id, booking_id, status, supplier_type, service_description, service_date, service_time, pickup_location, dropoff_location, pax, reply_deadline, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note, resource_kind'

function when(l: PortalLine): string | null {
  if (!l.date) return null
  const d = new Date(`${l.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return l.time ? `${d} · ${l.time}` : d
}

function asView(l: PortalLine, operatorName: string, supplierName: string): SupplierView {
  return {
    operatorName, supplierName, service: l.service, serviceDate: l.date, serviceTime: l.time, pickup: l.pickup, dropoff: l.dropoff,
    guests: l.guests, clientName: l.clientName, status: l.status, replyBy: l.replyBy, assign: l.assign,
    plate: l.plate, guideName: l.guideName, guidePhone: l.guidePhone, driverNote: l.driverNote,
  }
}

export default async function SupplierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidSupplierPageToken(token)) notFound()

  const db = createAdminClient()
  const { data: link } = await db
    .from('supplier_portal_links')
    .select('id, tenant_id, supplier_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (!link) notFound()

  const today = new Date().toISOString().slice(0, 10)
  const [{ data: tenant }, { data: supplier }, { data: rows }, { data: daysOff }, { data: expenses }] = await Promise.all([
    db.from('tenants').select('company_name').eq('id', link.tenant_id).maybeSingle(),
    db.from('suppliers').select('name, company_name').eq('id', link.supplier_id).eq('tenant_id', link.tenant_id).maybeSingle(),
    db.from('booking_supplier_status').select(COLUMNS)
      .eq('tenant_id', link.tenant_id).eq('supplier_id', link.supplier_id)
      .in('status', ['requested', 'accepted', 'assigned', 'done'])
      .neq('resource_kind', 'own')
      .limit(500),
    db.from('supplier_unavailable_days').select('day, note, marked_by')
      .eq('tenant_id', link.tenant_id).eq('supplier_id', link.supplier_id).gte('day', today).order('day').limit(200),
    // What they're owed: only expenses made from their service lines (lib/supplier-owed).
    db.from('expenses').select('id, amount, currency, status, expense_date, payment_date, booking_supplier_status_id')
      .eq('tenant_id', link.tenant_id).eq('supplier_id', link.supplier_id).not('booking_supplier_status_id', 'is', null)
      .in('status', ['pending', 'approved', 'paid']).order('expense_date', { ascending: false }).limit(300),
  ])
  if (!supplier) notFound()

  // The lead traveller's name, for the meeting sign — nothing else of the trip.
  const lines = (rows ?? []) as PortalSourceLine[]
  const bookingIds = [...new Set(lines.map(l => l.booking_id))]
  const { data: bookings } = bookingIds.length
    ? await db.from('bookings').select('id, itinerary_id').in('id', bookingIds).eq('tenant_id', link.tenant_id)
    : { data: [] }
  const tripIds = (bookings ?? []).map(b => b.itinerary_id).filter(Boolean) as string[]
  const { data: trips } = tripIds.length ? await db.from('itineraries').select('id, client_name').in('id', tripIds) : { data: [] }
  const clientOf = (bookingId: string) => {
    const trip = (bookings ?? []).find(b => b.id === bookingId)?.itinerary_id
    return ((trips ?? []).find(t => t.id === trip)?.client_name as string | null) ?? null
  }

  void db.from('supplier_portal_links').update({ last_opened_at: new Date().toISOString() }).eq('id', link.id)
    .then(({ error }) => { if (error) console.error('[supplier page] opened stamp:', error.message) })

  const operatorName = (tenant?.company_name as string | null) ?? 'Your client'
  const supplierName = ((supplier.name || supplier.company_name) as string | null) ?? 'Supplier'
  // The service name of each expense's line (their own lines only).
  const expenseLineIds = [...new Set((expenses ?? []).map(e => e.booking_supplier_status_id as string))]
  const { data: expenseLines } = expenseLineIds.length
    ? await db.from('booking_supplier_status').select('id, service_description, supplier_type')
      .in('id', expenseLineIds).eq('tenant_id', link.tenant_id).eq('supplier_id', link.supplier_id)
    : { data: [] }
  const serviceOf = (id: string) => {
    const l = (expenseLines ?? []).find(x => x.id === id)
    return l ? ((l.service_description || l.supplier_type) as string | null) : null
  }
  const owed = owedView((expenses ?? []) as OwedSource[], serviceOf, today)
  const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const sections = portalSections(lines.map(l => toPortalLine(l, clientOf(l.booking_id))), today)

  const card = (l: PortalLine, answerable: boolean) => (
    <li key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-900">{l.service}</p>
        <p className="text-sm text-gray-600">{when(l) ?? 'Date to be confirmed'}</p>
        <div className="mt-1 text-sm text-gray-700 space-y-0.5">
          {l.pickup && <p>Pickup: {l.pickup}</p>}
          {l.dropoff && <p>Drop-off: {l.dropoff}</p>}
          {l.guests && <p>Guests: {l.guests}</p>}
          {l.clientName && <p>Client: {l.clientName}</p>}
          {l.status === 'requested' && l.replyBy && (
            <p className="text-amber-700">Please answer by {new Date(l.replyBy).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          )}
          {!answerable && (l.plate || l.guideName) && <p>{l.plate ? `Car: ${l.plate}` : `Guide: ${l.guideName}`}{l.driverNote ? ` · Driver: ${l.driverNote}` : ''}</p>}
        </div>
      </div>
      {answerable && <ReplyButtons token={token} view={asView(l, operatorName, supplierName)} endpoint={`/api/supplier-page/${token}/lines/${l.id}`} />}
    </li>
  )

  const section = (title: string, list: PortalLine[], answerable: boolean, empty: string) => (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title} ({list.length})</h2>
      {list.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : <ul className="space-y-3">{list.map(l => card(l, answerable))}</ul>}
    </section>
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-gray-400">Bookings from {operatorName}</p>
        <h1 className="text-xl font-semibold mt-1 text-white">{supplierName}</h1>
        <p className="text-sm text-gray-300 mt-1">Answer with one tap — no login. Keep this link: it is the same every time.</p>
      </header>
      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {section('To answer', sections.requests, true, 'No requests waiting — thank you.')}
        {section('Upcoming', sections.upcoming, true, 'Nothing booked yet.')}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Days you can’t work</h2>
          <p className="text-sm text-gray-600">Mark them here and {operatorName} will see it before asking you.</p>
          <DaysOffEditor url={`/api/supplier-page/${token}/days-off`} who="supplier" initial={(daysOff ?? []) as DayOff[]} />
        </section>
        {section('Done', sections.done, false, 'Nothing in the last two months.')}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">What you’re owed</h2>
          {owed.unpaid.length > 0 && (
            <p className="rounded-xl bg-white border border-gray-200 px-4 py-3 text-sm text-gray-900">
              Not yet paid: <span className="font-semibold">{owed.unpaid.map(u => money(u.amount, u.currency)).join(' + ')}</span>
            </p>
          )}
          {owed.items.length === 0 ? <p className="text-sm text-gray-500">Nothing recorded yet.</p> : (
            <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
              {owed.items.map(o => (
                <li key={o.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-gray-900 truncate">{o.service}</p>
                    <p className="text-xs text-gray-500">
                      {o.date ? new Date(`${o.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''}
                      {' · '}{OWED_LABEL[o.state]}{o.paidOn ? ` on ${new Date(`${o.paidOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 font-medium ${o.state === 'paid' ? 'text-green-700' : 'text-gray-900'}`}>{money(o.amount, o.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500">Questions about a payment? Contact {operatorName}.</p>
        </section>
      </div>
    </main>
  )
}
