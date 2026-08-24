import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// TRIP EVENTS — the checkpoint log (execution layer)
// ============================================
// POST records "picked up at CAI 14:32 by Ahmed"; GET lists a trip's timeline
// for the office. Tenant-scoped through requireAuth + RLS; the table is
// append-only for authenticated users (no update/delete policies), so there
// is deliberately no PUT/DELETE here — corrections are new events.

const EVENT_KINDS = [
  'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
  'checked_in', 'checked_out', 'completed', 'delayed', 'note',
] as const
type EventKind = (typeof EVENT_KINDS)[number]

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const body = await request.json()
    const { itinerary_id, event_kind, itinerary_resource_id, lat, lng, note, actor_name, occurred_at } = body

    if (!itinerary_id || !event_kind) {
      return NextResponse.json({ success: false, error: 'itinerary_id and event_kind are required' }, { status: 400 })
    }
    if (!EVENT_KINDS.includes(event_kind as EventKind)) {
      return NextResponse.json(
        { success: false, error: `event_kind must be one of: ${EVENT_KINDS.join(', ')}` },
        { status: 400 }
      )
    }
    // A coordinate is either a real pair or absent — half a pin is a bug.
    const hasLat = lat !== undefined && lat !== null
    const hasLng = lng !== undefined && lng !== null
    if (hasLat !== hasLng) {
      return NextResponse.json({ success: false, error: 'lat and lng must be provided together' }, { status: 400 })
    }
    if (hasLat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))
        || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) {
      return NextResponse.json({ success: false, error: 'lat/lng out of range' }, { status: 400 })
    }

    // The itinerary must be the caller's own (RLS enforces this on the read).
    const { data: itin, error: itinErr } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', itinerary_id)
      .maybeSingle()
    if (itinErr || !itin) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // If the event names an assignment, it must belong to this itinerary —
    // otherwise a typo silently attaches the driver of one trip to another.
    if (itinerary_resource_id) {
      const { data: res } = await supabase
        .from('itinerary_resources')
        .select('id')
        .eq('id', itinerary_resource_id)
        .eq('itinerary_id', itinerary_id)
        .maybeSingle()
      if (!res) {
        return NextResponse.json(
          { success: false, error: 'itinerary_resource_id does not belong to this itinerary' },
          { status: 400 }
        )
      }
    }

    // Unified identity (mig 288): the session user's directory row, if the
    // 264/265 link triggers created one. Best-effort — never blocks the log.
    const { data: me } = await supabase
      .from('team_members')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('user_id', authResult.user!.id)
      .maybeSingle()

    const { data: event, error: insertErr } = await supabase
      .from('trip_events')
      .insert({
        tenant_id,
        itinerary_id,
        actor_team_member_id: me?.id ?? null,
        itinerary_resource_id: itinerary_resource_id || null,
        event_kind,
        occurred_at: occurred_at || new Date().toISOString(),
        lat: hasLat ? Number(lat) : null,
        lng: hasLat ? Number(lng) : null,
        note: note || null,
        actor_name: actor_name || null,
      })
      .select('id, event_kind, occurred_at')
      .single()

    if (insertErr) {
      console.error('[trip-events POST]', insertErr.message)
      return NextResponse.json({ success: false, error: 'Failed to record the event' }, { status: 500 })
    }

    return NextResponse.json({ success: true, event })
  } catch (err) {
    console.error('[trip-events POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const itineraryId = request.nextUrl.searchParams.get('itinerary_id')
    if (!itineraryId) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }

    const { data: events, error } = await supabase
      .from('trip_events')
      .select('id, itinerary_resource_id, event_kind, occurred_at, lat, lng, note, actor_name, created_at')
      .eq('itinerary_id', itineraryId)
      .order('occurred_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[trip-events GET]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to load events' }, { status: 500 })
    }
    return NextResponse.json({ success: true, events: events ?? [] })
  } catch (err) {
    console.error('[trip-events GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
