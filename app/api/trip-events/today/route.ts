import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * The ops-board seed: every trip that is ON THE GROUND today (start_date <=
 * today <= end_date, not cancelled), with its latest checkpoint. One call,
 * one dashboard card — the office sees all running tours at a glance without
 * opening each itinerary.
 */
export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase } = auth
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: trips, error: tripsErr } = await supabase
      .from('itineraries')
      .select('id, trip_name, client_name, start_date, end_date, status')
      .lte('start_date', today)
      .gte('end_date', today)
      .neq('status', 'cancelled')
      .is('cancelled_at', null)
      .order('start_date', { ascending: true })
      .limit(50)
    if (tripsErr) {
      console.error('[trip-events today]', tripsErr.message)
      return NextResponse.json({ success: false, error: 'Failed to load trips' }, { status: 500 })
    }
    if (!trips || trips.length === 0) {
      return NextResponse.json({ success: true, trips: [] })
    }

    // Latest event per trip, in one query: newest-first for all active trips,
    // reduced here. 200 rows cover 50 trips' heads comfortably; a trip whose
    // last checkpoint is buried deeper than that is not "live" in any sense
    // that matters to a today-view.
    const { data: events, error: evErr } = await supabase
      .from('trip_events')
      .select('itinerary_id, event_kind, occurred_at, actor_name, lat, lng')
      .in('itinerary_id', trips.map(t => t.id))
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (evErr) {
      console.error('[trip-events today]', evErr.message)
      return NextResponse.json({ success: false, error: 'Failed to load events' }, { status: 500 })
    }

    const latest = new Map<string, NonNullable<typeof events>[number]>()
    for (const e of events ?? []) {
      if (!latest.has(e.itinerary_id)) latest.set(e.itinerary_id, e)
    }

    // Unanswered traveller messages per trip (mig 291) — the board's "someone
    // is waiting on you" signal. Best-effort: a failure here must not take
    // down the board, which predates the chat.
    const unread = new Map<string, number>()
    try {
      const { data: unreadRows } = await supabase
        .from('trip_messages')
        .select('itinerary_id')
        .in('itinerary_id', trips.map(t => t.id))
        .eq('direction', 'inbound')
        .eq('is_read', false)
        .limit(500)
      for (const m of unreadRows ?? []) {
        unread.set(m.itinerary_id, (unread.get(m.itinerary_id) ?? 0) + 1)
      }
    } catch (err) {
      console.error('[trip-events today] unread count failed:', err)
    }

    return NextResponse.json({
      success: true,
      trips: trips.map(t => ({
        id: t.id,
        trip_name: t.trip_name,
        client_name: t.client_name,
        start_date: t.start_date,
        end_date: t.end_date,
        latest_event: latest.get(t.id) ?? null,
        unread_messages: unread.get(t.id) ?? 0,
      })),
    })
  } catch (err) {
    console.error('[trip-events today]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
