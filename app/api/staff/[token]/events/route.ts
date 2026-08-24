import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidStaffToken, STAFF_EVENT_KINDS, type StaffEventKind } from '@/lib/staff-link'

/**
 * The tap. Token-authenticated (no session — the driver has no login), on the
 * middleware self-auth allowlist. The token resolves to exactly one active
 * assignment; everything about the event is derived server-side from that row
 * — tenant, itinerary, assignment, actor name — so the request body can only
 * say WHAT happened (kind) and WHERE (an optional tap-time lat/lng pair).
 * occurred_at is server time: a checkpoint log takes no client clocks.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidStaffToken(token)) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const supabase = createAdminClient()

    const { data: link } = await supabase
      .from('staff_links')
      .select('tenant_id, itinerary_id, itinerary_resource_id')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const { data: resource } = await supabase
      .from('itinerary_resources')
      .select('id, resource_name, status')
      .eq('id', link.itinerary_resource_id)
      .maybeSingle()
    if (!resource || resource.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const { event_kind, lat, lng } = body
    if (!STAFF_EVENT_KINDS.includes(event_kind as StaffEventKind)) {
      return NextResponse.json({ success: false, error: 'Invalid event kind' }, { status: 400 })
    }
    const hasLat = lat !== undefined && lat !== null
    const hasLng = lng !== undefined && lng !== null
    if (hasLat !== hasLng) {
      return NextResponse.json({ success: false, error: 'lat and lng must be provided together' }, { status: 400 })
    }
    if (hasLat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))
        || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) {
      return NextResponse.json({ success: false, error: 'lat/lng out of range' }, { status: 400 })
    }

    // A tap-link in the wrong hands must not be able to flood the log: cap
    // the last hour per assignment. 60 real checkpoints in an hour is not a
    // trip, it is an incident.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('trip_events')
      .select('id', { count: 'exact', head: true })
      .eq('itinerary_resource_id', link.itinerary_resource_id)
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= 60) {
      return NextResponse.json({ success: false, error: 'Too many events, slow down' }, { status: 429 })
    }

    const { data: event, error: insErr } = await supabase
      .from('trip_events')
      .insert({
        tenant_id: link.tenant_id,
        itinerary_id: link.itinerary_id,
        itinerary_resource_id: link.itinerary_resource_id,
        event_kind,
        occurred_at: new Date().toISOString(),
        lat: hasLat ? Number(lat) : null,
        lng: hasLat ? Number(lng) : null,
        actor_name: resource.resource_name ?? null,
      })
      .select('event_kind, occurred_at')
      .single()
    if (insErr) {
      console.error('[staff events POST]', insErr.message)
      return NextResponse.json({ success: false, error: 'Failed to record the event' }, { status: 500 })
    }
    return NextResponse.json({ success: true, event })
  } catch (err) {
    console.error('[staff events POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
