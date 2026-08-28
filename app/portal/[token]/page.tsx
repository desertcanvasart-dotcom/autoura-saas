// ============================================
// CUSTOMER PORTAL — /portal/[token]  (C1a)
// ============================================
// Server component. The token resolves a booking_portal_links row via the
// service role (middleware opens the path; THIS page is the gatekeeper):
// unusable tokens render a uniform not-found, an unverified visitor gets
// only the confirmation gate, and the booking renders exclusively behind
// the verified cookie.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-server'
import {
  isValidPortalToken,
  isPortalVerified,
  portalLinkState,
  portalVerifyCookieName,
} from '@/lib/booking-portal'
import VerifyGate from './VerifyGate'
import PortalContent from './PortalContent'

export const dynamic = 'force-dynamic'

function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-gray-800">This link is not available</h1>
        <p className="mt-2 text-sm text-gray-500">
          The link may have expired or been replaced. Please contact your travel agency.
        </p>
      </div>
    </main>
  )
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidPortalToken(token)) return <NotFound />

  const supabase = createAdminClient()
  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('id, tenant_id, booking_id, passenger_id, revoked_at, expires_at, form_locked')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return <NotFound />

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_number, trip_name, start_date, end_date, total_days, num_travelers, status, tenant_id')
    .eq('id', link.booking_id)
    .maybeSingle()
  if (!booking || booking.tenant_id !== link.tenant_id) return <NotFound />

  const { data: tenant } = await supabase
    .from('tenants')
    .select('company_name, logo_url')
    .eq('id', link.tenant_id)
    .maybeSingle()

  const cookieStore = await cookies()
  const verified = isPortalVerified(token, cookieStore.get(portalVerifyCookieName(token))?.value)

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {tenant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt="" className="h-8 w-auto" />
          ) : null}
          <div>
            <p className="text-sm font-semibold text-gray-900">{tenant?.company_name ?? 'Your trip'}</p>
            <p className="text-xs text-gray-500">Traveller portal</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <h1 className="text-base font-semibold text-gray-900">{booking.trip_name ?? 'Your trip'}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {booking.booking_number}
            {booking.start_date && ` · ${booking.start_date}`}
            {booking.end_date && ` → ${booking.end_date}`}
            {booking.num_travelers ? ` · ${booking.num_travelers} traveller${booking.num_travelers === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {verified ? (
          <PortalContent token={token} scope={link.passenger_id ? 'traveller' : 'booking'} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Confirm it&rsquo;s you</h2>
            <p className="text-xs text-gray-500 mb-4">
              {link.passenger_id
                ? 'Enter your family name and date of birth to open your details.'
                : 'Enter the booking number or the lead traveller’s family name.'}
            </p>
            <VerifyGate token={token} requireDob={!!link.passenger_id} />
          </div>
        )}
      </div>
    </main>
  )
}
