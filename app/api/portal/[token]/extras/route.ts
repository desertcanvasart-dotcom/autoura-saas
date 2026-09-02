// ============================================
// /api/portal/[token]/extras — what the traveller can buy
// ============================================
// GET   the offers waiting for an answer, and what they have already asked for
// POST  the traveller asks for something  { title, note }
//
// Ported from travel-ops-pro. THE PORTAL NEVER MOVES MONEY. A traveller can
// ask, and can accept an offer the office has priced — both of which leave the
// extra short of `confirmed`, the only status that changes what is owed. The
// office confirms, on the operator side.
//
// AND IT NEVER SETS A PRICE. A request arrives unpriced by construction: the
// body carries a title and a note, nothing else.

import { NextRequest, NextResponse } from 'next/server'
import { isValidPortalToken, portalLinkState, portalVerifyCookieName, isPortalVerified } from '@/lib/booking-portal'
import { PORTAL_VISIBLE_STATUSES, portalExtraView } from '@/lib/portal/extras-scope'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { sendPushToTenant } from '@/lib/push'
import { extrasAdmin } from '@/lib/booking-extras-db'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export interface PortalLink {
  booking_id: string
  tenant_id: string
  passenger_id: string | null
}

/** Everything the two portal extras routes check before touching anything. */
export async function resolvePortalExtrasLink(
  request: NextRequest,
  token: string
): Promise<{ link: PortalLink } | { error: NextResponse }> {
  if (!checkRateLimit(`portal-extras:${getClientIdentifier(request)}`, 'api').success) {
    return { error: NextResponse.json({ error: 'Too many requests' }, { status: 429 }) }
  }
  if (!isValidPortalToken(token)) return { error: notFound() }
  if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) {
    return { error: NextResponse.json({ error: 'Please verify your identity first.' }, { status: 403 }) }
  }

  const { data: link } = await extrasAdmin()
    .from('booking_portal_links')
    .select('booking_id, tenant_id, passenger_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return { error: notFound() }

  return { link: link as PortalLink }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolvePortalExtrasLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved
  const admin = extrasAdmin()

  let query = admin
    .from('booking_extras')
    .select('id, kind, title, description, quantity, unit_price, currency, status, passenger_id, created_at')
    .eq('booking_id', link.booking_id)
    .eq('tenant_id', link.tenant_id)
    .in('status', PORTAL_VISIBLE_STATUSES as unknown as string[])
    .order('created_at', { ascending: true })

  // A private per-traveller link is ONE PERSON'S. It shows that person's own
  // extras and nothing else — not the party's, which are the lead's to answer.
  if (link.passenger_id) query = query.eq('passenger_id', link.passenger_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Could not load your options.' }, { status: 500 })

  const { data: booking } = await admin.from('bookings').select('currency').eq('id', link.booking_id).maybeSingle()

  return NextResponse.json({
    currency: booking?.currency || 'EUR',
    canRequest: true,
    // portalExtraView, not the row: no unit price, no supplier, no cost.
    extras: (data ?? []).map(portalExtraView),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolvePortalExtrasLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved
  const admin = extrasAdmin()

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return NextResponse.json({ error: 'Please tell us what you would like.' }, { status: 400 })
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null

  // The same title twice is a double-tap rather than a second request.
  const { data: existing } = await admin
    .from('booking_extras')
    .select('id')
    .eq('booking_id', link.booking_id)
    .eq('status', 'requested')
    .eq('title', title)
    .maybeSingle()
  if (existing) return NextResponse.json({ success: true, duplicate: true })

  const { error } = await admin.from('booking_extras').insert({
    tenant_id: link.tenant_id,
    booking_id: link.booking_id,
    // A private link's request belongs to that traveller; a family link's is
    // the party's.
    passenger_id: link.passenger_id,
    kind: 'addon',
    title,
    description: note,
    quantity: 1,
    // Unpriced, and not confirmable until the office prices it.
    unit_price: null,
    currency: null,
    status: 'requested',
    requested_via: 'portal',
  })
  if (error) {
    console.error('portal extras: could not record request', error)
    return NextResponse.json({ error: 'Could not send your request.' }, { status: 500 })
  }

  void sendPushToTenant(link.tenant_id, {
    title: 'A traveller asked for an extra',
    body: `“${title}” — price it and reply from the booking.`,
    url: `/bookings/${link.booking_id}`,
    tag: `extra-request-${link.booking_id}`,
  })

  return NextResponse.json({ success: true })
}
