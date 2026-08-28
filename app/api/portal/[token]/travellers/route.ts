// GET/PUT /api/portal/[token]/travellers — the traveller details behind the
// gate. Token + verified cookie required (the cookie proves the human factor;
// the token alone is a URL someone may have forwarded).
//
// Scope follows the link: a PRIVATE link reads and writes exactly one
// passenger; the booking-level link covers all of them. Writes cross the
// boundary only through pickWritableFields — identity and linkage columns
// are unreachable from the portal by construction.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  isValidPortalToken,
  isPortalVerified,
  portalLinkState,
  portalVerifyCookieName,
  pickWritableFields,
  PASSENGER_WRITABLE_FIELDS,
} from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

const NOT_FOUND = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

async function resolveVerifiedLink(request: NextRequest, token: string) {
  if (!isValidPortalToken(token)) return null
  const cookie = request.cookies.get(portalVerifyCookieName(token))?.value
  if (!isPortalVerified(token, cookie)) return null
  const supabase = createAdminClient()
  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('id, tenant_id, booking_id, passenger_id, revoked_at, expires_at, form_locked')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return null
  return { supabase, link }
}

// The portal projection: never the whole row (no tenant ids, no room
// assignment internals, no timestamps).
const READABLE = `id, ${PASSENGER_WRITABLE_FIELDS.join(', ')}, passenger_type, is_lead_passenger`

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const resolved = await resolveVerifiedLink(request, token)
    if (!resolved) return NOT_FOUND()
    const { supabase, link } = resolved

    let query = supabase
      .from('booking_passengers')
      .select(READABLE)
      .eq('booking_id', link.booking_id)
      .order('is_lead_passenger', { ascending: false })
      .order('created_at', { ascending: true })
    if (link.passenger_id) query = query.eq('id', link.passenger_id)

    const { data, error } = await query
    if (error) return NOT_FOUND()
    return NextResponse.json({
      success: true,
      travellers: data ?? [],
      scope: link.passenger_id ? 'traveller' : 'booking',
      form_locked: !!link.form_locked,
    })
  } catch {
    return NOT_FOUND()
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const ip = getClientIdentifier(request)
    if (!checkRateLimit(`portal-pax:${ip}`, 'api').success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }
    const resolved = await resolveVerifiedLink(request, token)
    if (!resolved) return NOT_FOUND()
    const { supabase, link } = resolved
    if (link.form_locked) {
      return NextResponse.json(
        { success: false, error: 'Details are confirmed and locked — contact your agency for changes.' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const passengerId = typeof body?.id === 'string' ? body.id : null
    if (!passengerId) return NextResponse.json({ success: false, error: 'Missing traveller id' }, { status: 400 })
    // A private link may only write its own passenger, whatever id was sent.
    if (link.passenger_id && passengerId !== link.passenger_id) return NOT_FOUND()

    const patch = pickWritableFields(body)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('booking_passengers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', passengerId)
      .eq('booking_id', link.booking_id)   // linkage enforced server-side
      .select(READABLE)
      .maybeSingle()
    if (error || !data) return NOT_FOUND()
    return NextResponse.json({ success: true, traveller: data })
  } catch {
    return NOT_FOUND()
  }
}
