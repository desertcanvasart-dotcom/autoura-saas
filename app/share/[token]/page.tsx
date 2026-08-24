import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import {
  isValidShareToken,
  toClientItinerary,
  toClientTeam,
  toClientTripEvents,
  type ClientItinerary,
  type ClientTeamMember,
  type ClientTripEvent,
} from '@/lib/itinerary-share'

// ============================================
// THE SHAREABLE ITINERARY PAGE — public, token-gated
// ============================================
// A traveller's view of their trip: branded with the operator's logo and
// color, readable on a phone, current every time it is opened.
//
// Security shape (see migration 253):
//   * Public via middleware allowlist, but only for a token that resolves to
//     an UNREVOKED share — everything else is a plain 404, indistinguishable
//     from a URL that never existed.
//   * All reads use the service role HERE, server-side; nothing on this page
//     ships a Supabase client to the browser.
//   * Data crosses the boundary only through toClientItinerary(), an
//     allowlist projection with tests proving the cost base cannot survive it.

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface Operator {
  name: string
  logoUrl: string | null
  brandHex: string
  email: string | null
  phone: string | null
  website: string | null
}

async function loadShare(token: string): Promise<{ itinerary: ClientItinerary; operator: Operator; team: ClientTeamMember[]; events: ClientTripEvent[] } | null> {
  if (!isValidShareToken(token)) return null
  const supabase = admin()

  const { data: share } = await supabase
    .from('itinerary_shares')
    .select('id, itinerary_id, tenant_id, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked_at) return null

  const [{ data: itinerary }, { data: days }, { data: tenant }, { data: resources }] = await Promise.all([
    supabase.from('itineraries').select('*').eq('id', share.itinerary_id).maybeSingle(),
    supabase.from('itinerary_days').select('*').eq('itinerary_id', share.itinerary_id),
    supabase
      .from('tenants')
      .select('company_name, logo_url, primary_color, contact_email, company_phone, company_website')
      .eq('id', share.tenant_id)
      .maybeSingle(),
    // CONFIRMED only — a pending assignment is an internal plan, not a promise.
    // Explicit columns: this table also carries cost_eur/cost_non_eur/notes,
    // which must never even reach this process's memory for the page.
    supabase
      .from('itinerary_resources')
      .select('id, resource_type, resource_id, resource_name, start_date, end_date')
      .eq('itinerary_id', share.itinerary_id)
      .eq('status', 'confirmed'),
  ])
  // Checkpoint log — explicit columns; `note` and `actor_name` are INTERNAL
  // and are not even fetched for this page.
  const { data: eventRows } = await supabase
    .from('trip_events')
    .select('event_kind, occurred_at, itinerary_resource_id, lat, lng')
    .eq('itinerary_id', share.itinerary_id)
    .order('occurred_at', { ascending: false })
    .limit(30)
  if (!itinerary) return null

  // Contacts for the assigned people. Explicit columns again — guides carry
  // daily_rate and emergency_contact_*, none of which crosses this boundary.
  const idsOf = (t: string) =>
    (resources ?? []).filter((r) => r.resource_type === t && typeof r.resource_id === 'string').map((r) => r.resource_id as string)
  // supabase-js cannot type a dynamic column string; rows go straight into the
  // allowlist sanitizer, which is the real type boundary here.
  const fetchContacts = async (table: string, cols: string, ids: string[]): Promise<Array<Record<string, unknown>>> =>
    ids.length === 0
      ? []
      : (((await supabase.from(table).select(cols).in('id', ids)).data ?? []) as unknown as Array<Record<string, unknown>>)
  const [guideRows, airportRows, hotelStaffRows, vehicleRows] = await Promise.all([
    fetchContacts('guides', 'id, name, full_name, phone, whatsapp, profile_photo_url', idsOf('guide')),
    fetchContacts('airport_staff', 'id, name, phone, whatsapp', idsOf('airport_staff')),
    fetchContacts('hotel_staff', 'id, name, phone, whatsapp', idsOf('hotel_staff')),
    fetchContacts('vehicles', 'id, name, vehicle_type, default_driver_name, default_driver_phone, photo_url', idsOf('vehicle')),
  ])

  // Engagement signal, best-effort — a failed count must never break the page.
  // Read-modify-write is fine at this fidelity; it is a signal, not a ledger.
  supabase
    .from('itinerary_shares')
    .update({ view_count: (share.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
    .eq('id', share.id)
    .then(() => {}, () => {})

  const brandHex = /^#[0-9a-fA-F]{6}$/.test(tenant?.primary_color || '') ? tenant!.primary_color! : '#647C47'

  return {
    itinerary: toClientItinerary(itinerary, days ?? []),
    events: toClientTripEvents(
      (eventRows ?? []) as Array<Record<string, unknown>>,
      (resources ?? []) as Array<Record<string, unknown>>
    ),
    team: toClientTeam((resources ?? []) as Array<Record<string, unknown>>, {
      guides: guideRows,
      airportStaff: airportRows,
      hotelStaff: hotelStaffRows,
      vehicles: vehicleRows,
    }),
    operator: {
      name: tenant?.company_name || '',
      logoUrl: tenant?.logo_url || null,
      brandHex,
      email: tenant?.contact_email || null,
      phone: tenant?.company_phone || null,
      website: tenant?.company_website || null,
    },
  }
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}

const CURRENCY: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

export default async function SharedItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await loadShare(token)
  if (!data) notFound()

  const { itinerary: it, operator: op, team, events } = data
  const EVENT_LABEL: Record<ClientTripEvent['kind'], string> = {
    departed: 'Departed', en_route: 'En route', arrived: 'Arrived',
    picked_up: 'Picked up', dropped_off: 'Dropped off',
    checked_in: 'Checked in', checked_out: 'Checked out',
    completed: 'Completed', delayed: 'Running late',
  }
  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const sameDay = d.toISOString().slice(0, 10) === todayStr
      return sameDay
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }
  const todayStr = new Date().toISOString().slice(0, 10)
  const withYouToday = (m: ClientTeamMember) =>
    !!m.startDate && m.startDate <= todayStr && (!m.endDate || todayStr <= m.endDate)
  const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`
  const TEAM_META: Record<ClientTeamMember['type'], { emoji: string; label: string }> = {
    guide: { emoji: '🧭', label: 'Your guide' },
    vehicle: { emoji: '🚐', label: 'Your driver' },
    airport_staff: { emoji: '🛬', label: 'Airport assistance' },
    hotel_staff: { emoji: '🛎', label: 'Hotel assistance' },
    hotel: { emoji: '🏨', label: 'Hotel' },
    restaurant: { emoji: '🍽', label: 'Restaurant' },
    cruise: { emoji: '🚢', label: 'Nile cruise' },
  }
  const sym = (it.currency && CURRENCY[it.currency]) || it.currency || ''
  const travellers = it.numAdults + it.numChildren

  return (
    <div className="min-h-screen bg-gray-50" style={{ ['--brand' as string]: op.brandHex }}>
      {/* Header */}
      <header className="text-white" style={{ background: op.brandHex }}>
        <div className="max-w-3xl mx-auto px-5 py-10">
          {op.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- remote tenant logo, size unknown
            <img src={op.logoUrl} alt={op.name} className="h-12 mb-4 rounded bg-white/90 p-1" />
          )}
          <p className="text-sm uppercase tracking-widest opacity-80">{op.name}</p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-1">{it.tripName}</h1>
          <p className="mt-3 text-sm opacity-90">
            {fmtDate(it.startDate)}{it.endDate ? ` – ${fmtDate(it.endDate)}` : ''}
            {it.totalDays ? ` · ${it.totalDays} days` : ''}
            {travellers > 0 ? ` · ${travellers} traveller${travellers === 1 ? '' : 's'}` : ''}
            {it.tier ? ` · ${it.tier}` : ''}
          </p>
        </div>
      </header>

      {/* Days */}
      <main className="max-w-3xl mx-auto px-5 py-8">
        <ol className="space-y-6">
          {it.days.map((day) => (
            <li key={day.dayNumber} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-baseline gap-3 px-5 pt-4">
                <span
                  className="shrink-0 w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center"
                  style={{ background: op.brandHex }}
                >
                  {day.dayNumber}
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900">
                    {day.title || `Day ${day.dayNumber}`}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {fmtDate(day.date)}
                    {day.city ? ` · ${day.city}` : ''}
                    {day.overnightCity && day.overnightCity !== day.city ? ` → ${day.overnightCity}` : ''}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-4 pt-3 sm:pl-[68px]">
                {day.description && (
                  <p className="text-sm text-gray-700 whitespace-pre-line">{day.description}</p>
                )}

                {day.attractions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {day.attractions.map((a) => (
                      <span key={a} className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  {day.isArrival && <span>✈️ Arrival</span>}
                  {day.isDeparture && <span>✈️ Departure</span>}
                  {(day.flightFrom || day.flightTo) && (
                    <span>🛫 {[day.flightFrom, day.flightTo].filter(Boolean).join(' → ')}</span>
                  )}
                  {day.isCruiseDay && <span>🚢 Nile cruise</span>}
                  {day.isFreeDay && <span>🌴 Free day</span>}
                  {day.lunchIncluded && <span>🍽 Lunch included</span>}
                  {day.dinnerIncluded && <span>🌙 Dinner included</span>}
                  {day.hotelIncluded && <span>🏨 {day.hotelName || 'Hotel included'}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Live updates — the checkpoint log, newest first */}
        {events.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Live updates</h2>
            <ol className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {events.map((e, i) => (
                <li key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${i === 0 ? 'animate-pulse' : ''}`} style={{ background: op.brandHex }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{e.teamMemberName || 'Your team'}</span>
                      {' — '}{EVENT_LABEL[e.kind]}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-xs text-gray-500">
                    {e.lat !== null && e.lng !== null && (
                      <a
                        href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="underline"
                      >
                        📍 map
                      </a>
                    )}
                    <span>{fmtTime(e.occurredAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Your team — confirmed assignments only; contacts for the people */}
        {team.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Who&rsquo;s with you</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {team.map((m, i) => (
                <li key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex gap-3">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded staff photo
                    <img src={m.photoUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-full bg-gray-100 text-xl flex items-center justify-center shrink-0">
                      {TEAM_META[m.type].emoji}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">{TEAM_META[m.type].label}</p>
                    <p className="font-semibold text-gray-900 truncate">{m.name}</p>
                    {m.type === 'vehicle' && m.driverName && (
                      <p className="text-xs text-gray-600">Driver: {m.driverName}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDate(m.startDate)}{m.endDate && m.endDate !== m.startDate ? ` – ${fmtDate(m.endDate)}` : ''}
                      {withYouToday(m) && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium align-middle" style={{ background: op.brandHex }}>
                          with you today
                        </span>
                      )}
                    </p>
                    {(m.whatsapp || m.phone) && (
                      <p className="mt-2 flex gap-2">
                        {m.whatsapp && (
                          <a href={waLink(m.whatsapp)} target="_blank" rel="noopener noreferrer"
                             className="text-xs px-2.5 py-1 rounded-full text-white font-medium" style={{ background: '#25D366' }}>
                            WhatsApp
                          </a>
                        )}
                        {m.phone && (
                          <a href={`tel:${m.phone.replace(/\s+/g, '')}`}
                             className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-700 font-medium">
                            Call
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Price — the client total, the only money on this page */}
        {it.totalPrice !== null && it.totalPrice > 0 && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total for {travellers || 'your'} traveller{travellers === 1 ? '' : 's'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {sym}{it.totalPrice.toLocaleString()}
              </p>
            </div>
            {it.code && <span className="text-xs text-gray-400">Ref: {it.code}</span>}
          </div>
        )}
      </main>

      {/* Operator footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-5 py-6 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">{op.name}</p>
          <p className="mt-1 space-x-3">
            {op.email && <a className="underline" href={`mailto:${op.email}`}>{op.email}</a>}
            {op.phone && <a className="underline" href={`tel:${op.phone.replace(/\s+/g, '')}`}>{op.phone}</a>}
            {op.website && (
              <a className="underline" href={op.website.startsWith('http') ? op.website : `https://${op.website}`} target="_blank" rel="noopener noreferrer">
                {op.website}
              </a>
            )}
          </p>
          <p className="mt-3 text-xs text-gray-400">
            This page always shows the latest version of your itinerary.
          </p>
        </div>
      </footer>
    </div>
  )
}
