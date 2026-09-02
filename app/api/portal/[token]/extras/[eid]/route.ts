// ============================================
// POST /api/portal/[token]/extras/[eid] — the traveller answers an offer
// ============================================
// { action: 'accept' | 'decline' }
//
// Accepting stops at `accepted`. It does NOT confirm, and so it does not move
// a single figure on the booking: the office still has to secure the thing
// with the supplier before the customer owes anything for it.

import { NextRequest, NextResponse } from 'next/server'
import { isValidPortalToken, portalLinkState, portalVerifyCookieName, isPortalVerified } from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { nextStatus } from '@/lib/booking-extras'
import { mayAnswerExtra } from '@/lib/portal/extras-scope'
import { sendPushToTenant } from '@/lib/push'
import { extrasAdmin } from '@/lib/booking-extras-db'

// The portal token in the path IS the credential, so this route proves it
// itself — validity, identity verification, and a usable link row — the same
// gate as every other /api/portal route, checked before anything is touched.
async function resolveLink(request: NextRequest, token: string) {
  if (!checkRateLimit(`portal-extras:${getClientIdentifier(request)}`, 'api').success) {
    return { error: NextResponse.json({ error: 'Too many requests' }, { status: 429 }) }
  }
  if (!isValidPortalToken(token)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) {
    return { error: NextResponse.json({ error: 'Please verify your identity first.' }, { status: 403 }) }
  }
  const { data: link } = await extrasAdmin()
    .from('booking_portal_links')
    .select('booking_id, tenant_id, passenger_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { link: link as { booking_id: string; tenant_id: string; passenger_id: string | null } }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; eid: string }> }) {
  const { token, eid } = await params
  const resolved = await resolveLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved
  const admin = extrasAdmin()

  const body = await request.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'That is not something you can do here.' }, { status: 400 })
  }

  const { data: extra } = await admin
    .from('booking_extras')
    .select('id, title, status, unit_price, currency, passenger_id')
    .eq('id', eid)
    .eq('booking_id', link.booking_id)
    .eq('tenant_id', link.tenant_id)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // A private link may only answer for its own traveller.
  if (!mayAnswerExtra(link, extra)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const decision = nextStatus(extra.status, action, { unit_price: extra.unit_price, currency: extra.currency })
  if (!decision.ok) {
    return NextResponse.json({ error: 'This request has already moved on. Please contact your agency.' }, { status: 409 })
  }

  const updates: Record<string, unknown> = { status: decision.status, updated_at: new Date().toISOString() }
  if (decision.status === 'declined') updates.resolved_at = new Date().toISOString()

  const { error } = await admin.from('booking_extras').update(updates).eq('id', eid).eq('tenant_id', link.tenant_id)
  if (error) return NextResponse.json({ error: 'Could not send your answer.' }, { status: 500 })

  // Accepting is the moment the office has something to do — secure it, then
  // confirm. Declining needs no chasing.
  if (decision.status === 'accepted') {
    void sendPushToTenant(link.tenant_id, {
      title: 'A traveller accepted an extra',
      body: `“${extra.title}” — secure it with the supplier, then confirm it on the booking.`,
      url: `/bookings/${link.booking_id}`,
      tag: `extra-accepted-${link.booking_id}`,
    })
  }

  return NextResponse.json({ success: true, status: decision.status })
}
