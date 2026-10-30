import type { PortalLine } from '@/lib/supplier-portal'
import type { SupplierView } from '@/lib/supplier-reply-link'
import { OWED_LABEL } from '@/lib/supplier-owed'
import { agencyDateTime } from '@/lib/agency-time'
import type { SupplierAgencyData } from '@/lib/supplier-page-data'
import ReplyButtons from '@/app/reply/[token]/ReplyButtons'
import DaysOffEditor from '@/components/DaysOffEditor'

// One agency's bookings for a supplier: to answer, upcoming, days off, done,
// what they're owed. Shared by the per-agency page (2A) and the signed-in
// inbox (2B); only the endpoints the buttons post to differ.

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

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SupplierAgencyView({
  data,
  answerUrl,
  daysOffUrl,
  daysOffBody,
}: {
  data: SupplierAgencyData
  /** Where a tap on a line posts. */
  answerUrl: (lineId: string) => string
  daysOffUrl: string
  /** Added to every days-off request (the inbox names the agency). */
  daysOffBody?: Record<string, unknown>
}) {
  const { operatorName, supplierName, sections, daysOff, owed } = data

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
            <p className="text-amber-700">Please answer by {agencyDateTime(l.replyBy, data.timeZone)}</p>
          )}
          {!answerable && (l.plate || l.guideName) && <p>{l.plate ? `Car: ${l.plate}` : `Guide: ${l.guideName}`}{l.driverNote ? ` · Driver: ${l.driverNote}` : ''}</p>}
        </div>
      </div>
      {answerable && <ReplyButtons token="" view={asView(l, operatorName, supplierName)} endpoint={answerUrl(l.id)} />}
    </li>
  )

  const section = (title: string, list: PortalLine[], answerable: boolean, empty: string) => (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title} ({list.length})</h2>
      {list.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : <ul className="space-y-3">{list.map(l => card(l, answerable))}</ul>}
    </section>
  )

  return (
    <div className="space-y-8">
      {section('To answer', sections.requests, true, 'No requests waiting — thank you.')}
      {section('Upcoming', sections.upcoming, true, 'Nothing booked yet.')}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Days you can’t work</h2>
        <p className="text-sm text-gray-600">Mark them here and {operatorName} will see it before asking you.</p>
        <DaysOffEditor url={daysOffUrl} who="supplier" initial={daysOff} extraBody={daysOffBody} />
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
  )
}
