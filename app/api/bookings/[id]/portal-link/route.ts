// POST /api/bookings/[id]/portal-link — the operator side of the portal
// (C1a): mint (or reuse) the BOOKING-LEVEL portal link for a booking. The
// lead uses it to fill everyone in and to mint per-traveller private links
// from inside the portal. Staff-authenticated; the same lifecycle helpers as
// the in-portal coordinator, so the one-live-link rule cannot drift.

import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { mintOrReusePassengerLink } from '@/lib/booking-portal'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
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
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/${minted.token}`,
      created: minted.created,
    })
  } catch (error) {
    console.error('portal-link error:', error)
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
  }
}
