// POST /api/portal/[token]/change-request — the lead asks to add travellers.
//
// Adding people changes the price, so the portal cannot create passengers
// beyond the booked count. The lead files a request; the office re-prices
// and approves. Booking-level (family) link only, behind the gate
// (isValidPortalToken + verified cookie + portalLinkState).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  isValidPortalToken,
  isPortalVerified,
  portalLinkState,
  portalVerifyCookieName,
} from '@/lib/booking-portal'
import { sendPushToTenant } from '@/lib/push'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!checkRateLimit(`portal-cr:${getClientIdentifier(request)}`, 'api').success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }
    if (!isValidPortalToken(token)) return NOT_FOUND()
    if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) return NOT_FOUND()

    const db = createAdminClient()
    const { data: link } = await db
      .from('booking_portal_links')
      .select('tenant_id, booking_id, passenger_id, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!link || !portalLinkState(link).usable) return NOT_FOUND()
    // Party size is the lead's call: booking-level link only.
    if (link.passenger_id) return NOT_FOUND()

    const body = await request.json().catch(() => null)
    const count = Number(body?.count)
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return NextResponse.json({ success: false, error: 'Please check the number of travellers.' }, { status: 400 })
    }
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null

    // One pending request per booking (the partial unique index enforces it):
    // re-asking updates rather than piling up duplicates.
    const { data: existing } = await db
      .from('booking_change_requests')
      .select('id')
      .eq('booking_id', link.booking_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('booking_change_requests')
        .update({ requested_count: count, note, requested_via: 'portal', created_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ success: false, error: 'Could not submit — please try again.' }, { status: 500 })
    } else {
      const { error } = await db.from('booking_change_requests').insert({
        tenant_id: link.tenant_id,
        booking_id: link.booking_id,
        kind: 'add_traveller',
        requested_count: count,
        note,
        requested_via: 'portal',
        status: 'pending',
      })
      if (error) return NextResponse.json({ success: false, error: 'Could not submit — please try again.' }, { status: 500 })
    }

    void sendPushToTenant(link.tenant_id, {
      title: 'Change request: add travellers',
      body: `A booking requests ${count} additional traveller${count === 1 ? '' : 's'}.`,
      url: `/bookings/${link.booking_id}`,
      tag: `change-req-${link.booking_id}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[portal change-request]', err)
    return NextResponse.json({ success: false, error: 'Could not submit — please try again.' }, { status: 500 })
  }
}
