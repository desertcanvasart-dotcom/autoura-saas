// POST /api/bookings/[id]/change-requests/[cid] — approve or reject.
//
// Approve bumps num_travelers, seeds blank passenger rows (the portal then
// collects their details), and extends the AGREED per-person rate
// (lib/reprice-add-traveller.ts) onto total_amount / deposit_amount /
// balance_due. When there is no priced base to extend, the money is left
// alone and the response says the operator must reprice manually.
//
// The FX freeze (P4) is untouched by design: this adjusts the CLIENT side
// of a booking; fx_frozen governs supplier-side itinerary costs.

import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { computeAddTravellerReprice } from '@/lib/reprice-add-traveller'

const WRITE_ROLES = ['owner', 'admin', 'manager']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, role, user } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    if (!WRITE_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }
    const { id, cid } = await params

    const body = await request.json().catch(() => ({}))
    const action = body?.action
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: 'action must be approve or reject' }, { status: 400 })
    }

    // RLS-scoped reads prove both records are the caller's.
    const [{ data: booking }, { data: cr }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, num_travelers, total_amount, deposit_percent, balance_due')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('booking_change_requests')
        .select('id, booking_id, requested_count, status')
        .eq('id', cid)
        .eq('booking_id', id)
        .maybeSingle(),
    ])
    if (!booking || !cr) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (cr.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Already resolved' }, { status: 409 })
    }

    const admin = createAdminClient()
    const resolvedStamp = { resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null }

    if (action === 'reject') {
      const { error } = await admin
        .from('booking_change_requests')
        .update({ status: 'rejected', ...resolvedStamp })
        .eq('id', cid)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // Approve: money first (compute), then rows, then the stamp — the
    // request stays pending if anything before the stamp fails, so a retry
    // is possible and nothing is half-approved silently.
    const oldPax = booking.num_travelers ?? 0
    const reprice = computeAddTravellerReprice({
      oldTotal: booking.total_amount,
      oldPax,
      addedPax: cr.requested_count,
      depositPercent: booking.deposit_percent,
      oldBalanceDue: booking.balance_due,
    })

    const seedRows = Array.from({ length: cr.requested_count }, () => ({
      tenant_id,
      booking_id: id,
      first_name: '',
      last_name: '',
      passenger_type: 'adult',
      is_lead_passenger: false,
    }))
    const { error: paxError } = await admin.from('booking_passengers').insert(seedRows)
    if (paxError) return NextResponse.json({ success: false, error: paxError.message }, { status: 500 })

    const bookingPatch: Record<string, unknown> = {
      num_travelers: oldPax + cr.requested_count,
      updated_at: new Date().toISOString(),
    }
    if (reprice.method === 'per_person') {
      bookingPatch.total_amount = reprice.newTotal
      bookingPatch.deposit_amount = reprice.newDepositAmount
      bookingPatch.balance_due = reprice.newBalanceDue
    }
    const { error: bookingError } = await admin.from('bookings').update(bookingPatch).eq('id', id)
    if (bookingError) return NextResponse.json({ success: false, error: bookingError.message }, { status: 500 })

    const { error: stampError } = await admin
      .from('booking_change_requests')
      .update({ status: 'approved', ...resolvedStamp })
      .eq('id', cid)
    if (stampError) return NextResponse.json({ success: false, error: stampError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      status: 'approved',
      added: cr.requested_count,
      reprice,
    })
  } catch (err) {
    console.error('change-request resolve error:', err)
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
  }
}
