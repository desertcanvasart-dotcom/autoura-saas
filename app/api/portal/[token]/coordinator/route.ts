// POST /api/portal/[token]/coordinator — the lead coordinator mints and
// sends per-traveller PRIVATE links from inside the portal. Only the
// BOOKING-LEVEL link may do this (a private link coordinating other
// travellers' credentials would defeat its own scoping). Token + verified
// cookie required, like every portal surface.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  isValidPortalToken,
  isPortalVerified,
  portalLinkState,
  portalVerifyCookieName,
  mintOrReusePassengerLink,
  markSentAndDeliver,
} from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

const NOT_FOUND = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidPortalToken(token)) return NOT_FOUND()
    if (!checkRateLimit(`portal-coord:${getClientIdentifier(request)}`, 'api').success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }
    const cookie = request.cookies.get(portalVerifyCookieName(token))?.value
    if (!isPortalVerified(token, cookie)) return NOT_FOUND()

    const supabase = createAdminClient()
    const { data: link } = await supabase
      .from('booking_portal_links')
      .select('id, tenant_id, booking_id, passenger_id, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!link || !portalLinkState(link).usable) return NOT_FOUND()
    if (link.passenger_id) return NOT_FOUND() // booking-level links only

    const body = await request.json().catch(() => ({}))
    const passengerId = typeof body?.passenger_id === 'string' ? body.passenger_id : null
    if (!passengerId) return NextResponse.json({ success: false, error: 'Missing traveller' }, { status: 400 })

    // The passenger must belong to THIS booking.
    const { data: pax } = await supabase
      .from('booking_passengers')
      .select('id, email')
      .eq('id', passengerId)
      .eq('booking_id', link.booking_id)
      .maybeSingle()
    if (!pax) return NOT_FOUND()

    const { data: booking } = await supabase
      .from('bookings')
      .select('start_date, trip_name')
      .eq('id', link.booking_id)
      .maybeSingle()

    const minted = await mintOrReusePassengerLink(supabase, {
      tenantId: link.tenant_id,
      bookingId: link.booking_id,
      passengerId,
      startDate: booking?.start_date ?? null,
    })
    if ('error' in minted) {
      return NextResponse.json({ success: false, error: 'Could not create the link' }, { status: 500 })
    }

    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/${minted.token}`
    let sent = false
    if (body?.send === true && pax.email) {
      const delivery = await markSentAndDeliver(supabase, {
        token: minted.token,
        passengerId,
        tenantId: link.tenant_id,
        url,
        tripName: booking?.trip_name ?? null,
      })
      sent = delivery.sent
    }

    return NextResponse.json({ success: true, url, created: minted.created, sent })
  } catch {
    return NOT_FOUND()
  }
}
