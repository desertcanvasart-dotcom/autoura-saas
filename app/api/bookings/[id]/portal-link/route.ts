// POST /api/bookings/[id]/portal-link — the operator side of the portal
// (C1a): mint (or reuse) the BOOKING-LEVEL portal link for a booking. The
// lead uses it to fill everyone in and to mint per-traveller private links
// from inside the portal. Staff-authenticated; the same lifecycle helpers as
// the in-portal coordinator, so the one-live-link rule cannot drift.

import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { mintOrReusePassengerLink } from '@/lib/booking-portal'
import { roleDenied } from '@/lib/api-role-gate'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }
    const { id } = await params

    // RLS-scoped read proves the booking is the caller's.
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, start_date')
      .eq('id', id)
      .maybeSingle()
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const minted = await mintOrReusePassengerLink(createAdminClient(), {
      tenantId: tenant_id,
      bookingId: id,
      passengerId: null,
      startDate: booking.start_date,
      createdBy: user?.id ?? null,
    })
    if ('error' in minted) {
      return NextResponse.json({ success: false, error: 'Could not create the link (database migration pending?)' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      // An absolute link even where NEXT_PUBLIC_APP_URL is unset: a bare
      // "/portal/…" pasted into WhatsApp opened nothing.
      url: `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/portal/${minted.token}`,
      created: minted.created,
    })
  } catch (error) {
    console.error('portal-link error:', error)
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
  }
}

// GET  — whether the booking's portal details are locked.
// PATCH { locked: boolean } — lock or unlock them. Locked, the travellers can
// still read the portal but no longer change their details, documents or
// extras requests (every portal route checks form_locked). Nothing set it
// before: the lock the portal honoured could never be turned on.
async function bookingLinks(id: string) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return { response: NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status }) }
  }
  const { supabase, tenant_id, role } = authResult
  // RLS-scoped read proves the booking is the caller's.
  const { data: booking } = await supabase.from('bookings').select('id').eq('id', id).maybeSingle()
  if (!booking) return { response: NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 }) }
  return { tenant_id, role }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await bookingLinks(id)
  if ('response' in ctx) return ctx.response
  const { data } = await createAdminClient()
    .from('booking_portal_links')
    .select('form_locked')
    .eq('tenant_id', ctx.tenant_id)
    .eq('booking_id', id)
    .is('revoked_at', null)
  const links = data ?? []
  return NextResponse.json({ success: true, hasLink: links.length > 0, locked: links.length > 0 && links.every(l => l.form_locked) })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await bookingLinks(id)
  if ('response' in ctx) return ctx.response
  const denied = roleDenied(ctx.role, 'staff')
  if (denied) return denied
  const body = await request.json().catch(() => ({}))
  if (typeof body?.locked !== 'boolean') {
    return NextResponse.json({ success: false, error: 'locked must be true or false' }, { status: 400 })
  }
  const { error } = await createAdminClient()
    .from('booking_portal_links')
    .update({ form_locked: body.locked })
    .eq('tenant_id', ctx.tenant_id)
    .eq('booking_id', id)
    .is('revoked_at', null)
  if (error) return NextResponse.json({ success: false, error: 'Could not change the lock' }, { status: 500 })
  return NextResponse.json({ success: true, locked: body.locked })
}
