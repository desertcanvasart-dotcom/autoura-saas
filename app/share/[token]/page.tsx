import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import {
  isValidShareToken,
  toClientItinerary,
  type ClientItinerary,
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

async function loadShare(token: string): Promise<{ itinerary: ClientItinerary; operator: Operator } | null> {
  if (!isValidShareToken(token)) return null
  const supabase = admin()

  const { data: share } = await supabase
    .from('itinerary_shares')
    .select('id, itinerary_id, tenant_id, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked_at) return null

  const [{ data: itinerary }, { data: days }, { data: tenant }] = await Promise.all([
    supabase.from('itineraries').select('*').eq('id', share.itinerary_id).maybeSingle(),
    supabase.from('itinerary_days').select('*').eq('itinerary_id', share.itinerary_id),
    supabase
      .from('tenants')
      .select('company_name, logo_url, primary_color, contact_email, company_phone, company_website')
      .eq('id', share.tenant_id)
      .maybeSingle(),
  ])
  if (!itinerary) return null

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

  const { itinerary: it, operator: op } = data
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
