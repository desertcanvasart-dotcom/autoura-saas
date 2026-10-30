import { bearerMatches } from '@/lib/support/probe-auth'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { notifyTeam } from '@/lib/notifications'
import { isCancelled } from '@/lib/bookings/service-booking-states'
import { CLIENT_TOLD, dayHasDetails, tomorrowOf, type DayLine } from '@/lib/bookings/client-day-message'

// ============================================
// Morning nudge: send tomorrow's clients their details
// ============================================
// Daily (06:00 UTC, ~8:00 in Egypt), from the reminders cron service
// (scripts/cron-reminders.mjs). For each booking with services tomorrow whose
// client has not been sent them yet: one bell item, linking to the booking's
// Suppliers tab where "Send the client the day's details" is. Nothing is sent
// to a client from here (D2).

const CRON_SECRET = process.env.CRON_SECRET

type Line = DayLine & { tenant_id: string; booking_id: string }

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient() as unknown as SupabaseClient
  const day = tomorrowOf(new Date())

  const { data, error } = await db
    .from('booking_supplier_status')
    .select('id, tenant_id, booking_id, status, service_date, service_time, service_description, supplier_type, pickup_location, dropoff_location, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note')
    .eq('service_date', day)
    .neq('status', 'cancelled')
  if (error) return NextResponse.json({ success: false, error: `Could not read tomorrow's services: ${error.message}` }, { status: 500 })

  const byBooking = new Map<string, Line[]>()
  for (const l of (data ?? []) as Line[]) {
    if (isCancelled(l.status)) continue
    byBooking.set(l.booking_id, [...(byBooking.get(l.booking_id) ?? []), l])
  }
  const bookingIds = [...byBooking.keys()]
  if (bookingIds.length === 0) return NextResponse.json({ success: true, bookings: 0, nudged: 0, failures: [] })

  // Already told today about tomorrow? Then no nudge.
  const { data: told, error: toldErr } = await db.from('service_booking_events')
    .select('booking_id').in('booking_id', bookingIds).eq('details->>kind', CLIENT_TOLD).eq('details->>date', day)
  if (toldErr) return NextResponse.json({ success: false, error: `Could not read what was sent: ${toldErr.message}` }, { status: 500 })
  const done = new Set((told ?? []).map(t => t.booking_id as string))

  const { data: bookings } = await db.from('bookings').select('id, itinerary_id').in('id', bookingIds)
  const tripIds = (bookings ?? []).map(b => b.itinerary_id).filter(Boolean) as string[]
  const { data: trips } = tripIds.length ? await db.from('itineraries').select('id, client_name').in('id', tripIds) : { data: [] }
  const clientOf = new Map<string, string>()
  for (const b of bookings ?? []) {
    const name = (trips ?? []).find(t => t.id === b.itinerary_id)?.client_name
    if (name) clientOf.set(b.id as string, name as string)
  }

  let nudged = 0
  const failures: string[] = []
  for (const [bookingId, lines] of byBooking) {
    if (done.has(bookingId)) continue
    const client = clientOf.get(bookingId) ?? 'The client'
    const ready = dayHasDetails(lines)
    try {
      await notifyTeam({
        tenant_id: lines[0].tenant_id,
        dedupe_key: `client-day:${bookingId}:${day}`,
        type: 'service_booking',
        title: `Tomorrow: send ${client} their details`,
        message: ready
          ? `${lines.length} service${lines.length === 1 ? '' : 's'} tomorrow — car / guide named. Send it on WhatsApp.`
          : `${lines.length} service${lines.length === 1 ? '' : 's'} tomorrow — no car or guide named yet.`,
        link: `/bookings/${bookingId}?tab=suppliers`,
      })
      nudged++
    } catch (e) {
      failures.push(`${bookingId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ success: failures.length === 0, bookings: bookingIds.length, nudged, failures, message: `${nudged} booking(s) reminded` })
}

export const GET = withJobRun('client-day-reminders', () => createAdminClient(), getHandler)
