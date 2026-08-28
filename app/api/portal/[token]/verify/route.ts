// POST /api/portal/[token]/verify — the confirmation gate's one endpoint.
//
// The visitor states a fact the traveller knows (booking number or lead's
// family name; on a PRIVATE per-traveller link, that traveller's family name
// AND date of birth). A match sets the verification cookie — an HMAC over
// the token with a server-side secret, so it cannot be forged from the URL.
// Failures are uniform and rate limited: this endpoint must not become an
// oracle for guessing names.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  isValidPortalToken,
  portalLinkState,
  portalVerifyCookieName,
  portalVerifyCookieValue,
  verifyAnswerMatches,
  verifyTravellerAnswer,
} from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

const FAIL = () =>
  NextResponse.json(
    // One uniform failure body: not-found, revoked and wrong-answer are
    // indistinguishable from outside.
    { success: false, error: 'The details entered do not match this booking.' },
    { status: 403 }
  )

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidPortalToken(token)) return FAIL()

    const limit = checkRateLimit(`portal-verify:${getClientIdentifier(request)}:${token.slice(0, 8)}`, 'auth')
    if (!limit.success) return FAIL()

    const body = await request.json().catch(() => ({}))
    const supabase = createAdminClient()

    const { data: link } = await supabase
      .from('booking_portal_links')
      .select('id, tenant_id, booking_id, passenger_id, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!link || !portalLinkState(link).usable) return FAIL()

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, booking_number, client_id')
      .eq('id', link.booking_id)
      .maybeSingle()
    if (!booking) return FAIL()

    let ok = false
    if (link.passenger_id) {
      const { data: pax } = await supabase
        .from('booking_passengers')
        .select('last_name, full_name, date_of_birth')
        .eq('id', link.passenger_id)
        .eq('booking_id', booking.id)
        .maybeSingle()
      ok = !!pax && verifyTravellerAnswer(body?.answer, body?.dob, {
        names: [pax.last_name, pax.full_name],
        date_of_birth: pax.date_of_birth,
      })
    } else {
      const [{ data: lead }, { data: client }] = await Promise.all([
        supabase
          .from('booking_passengers')
          .select('last_name, full_name')
          .eq('booking_id', booking.id)
          .eq('is_lead_passenger', true)
          .maybeSingle(),
        booking.client_id
          ? supabase.from('clients').select('full_name, last_name').eq('id', booking.client_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      ok = verifyAnswerMatches(body?.answer, {
        booking_number: booking.booking_number,
        client_name: (client as { full_name?: string | null } | null)?.full_name,
        lead_names: [
          lead?.last_name,
          lead?.full_name,
          (client as { last_name?: string | null } | null)?.last_name,
        ],
      })
    }
    if (!ok) return FAIL()

    const res = NextResponse.json({ success: true })
    res.cookies.set(portalVerifyCookieName(token), portalVerifyCookieValue(token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 60,
    })
    return res
  } catch {
    return FAIL()
  }
}
