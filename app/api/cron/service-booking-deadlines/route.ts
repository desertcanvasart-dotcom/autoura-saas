import { bearerMatches } from '@/lib/support/probe-auth'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { notifyTeam } from '@/lib/notifications'
import { recordServiceBookingEvent } from '@/lib/bookings/service-booking-events'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { supplierAlternatives } from '@/lib/bookings/cover-lookup'
import {
  REMINDER_DUE, REMINDER_SENT, expiredBell, isOverdue, lineLink, pickNextSupplier, reminderBell, reminderDue, remindedSince,
} from '@/lib/bookings/service-booking-deadlines'

// ============================================
// Supplier reply deadlines (lib/bookings/service-booking-deadlines)
// ============================================
// Every 5 minutes, from the mail-alerts cron service (scripts/cron-mail-
// alerts.mjs calls both). For every requested line still waiting:
//   halfway to its deadline → one bell nudge to send a reminder;
//   past its deadline      → No reply, back to the office, next supplier named.
// Tells the office only: no message ever goes to a supplier from here (D2).

const CRON_SECRET = process.env.CRON_SECRET
const MAX_PER_RUN = 500

interface Waiting {
  id: string
  tenant_id: string
  booking_id: string
  status: string | null
  supplier_id: string | null
  supplier_name: string | null
  supplier_type: string | null
  service_description: string | null
  service_date: string | null
  quoted_cost: number | null
  cost_currency: string | null
  itinerary_service_id: string | null
  requested_at: string | null
  reply_deadline: string | null
}

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient() as unknown as SupabaseClient
  const now = new Date()

  const { data, error } = await db
    .from('booking_supplier_status')
    .select('id, tenant_id, booking_id, status, supplier_id, supplier_name, supplier_type, service_description, service_date, quoted_cost, cost_currency, itinerary_service_id, requested_at, reply_deadline')
    .eq('status', 'requested')
    .not('reply_deadline', 'is', null)
    .order('reply_deadline', { ascending: true })
    .limit(MAX_PER_RUN)
  if (error) {
    return NextResponse.json({ success: false, error: `Could not read waiting requests: ${error.message}` }, { status: 500 })
  }
  const lines = (data ?? []) as Waiting[]

  // Reminders already logged for these lines (the job's nudge, or one the office sent).
  const ids = lines.map(l => l.id)
  const { data: events, error: eventsError } = ids.length
    ? await db.from('service_booking_events')
      .select('service_booking_id, occurred_at, details')
      .in('service_booking_id', ids)
      .in('details->>kind', [REMINDER_DUE, REMINDER_SENT])
    : { data: [], error: null }
  if (eventsError) {
    return NextResponse.json({ success: false, error: `Could not read reminders: ${eventsError.message}` }, { status: 500 })
  }

  let expired = 0
  let nudged = 0
  const failures: string[] = []

  for (const line of lines) {
    const link = lineLink(line.booking_id, line.id)
    try {
      if (isOverdue(line, now)) {
        const moved = await transitionServiceBooking(db, line.tenant_id, {
          id: line.id, bookingId: line.booking_id, to: 'expired', actor: 'system', channel: 'system',
          note: 'No reply by the deadline', now,
        })
        // 409 = answered or changed since we read it: nothing to do.
        if (!moved.ok) { if (moved.status !== 409) failures.push(`${line.id}: ${moved.error}`); continue }
        expired++

        let next = null
        if (line.itinerary_service_id) {
          const { data: svc } = await db.from('itinerary_services').select('rate_table, rate_id').eq('id', line.itinerary_service_id).maybeSingle()
          const options = await supplierAlternatives(db, line.tenant_id, line, (svc?.rate_table as string | null) ?? null, (svc?.rate_id as string | null) ?? null)
          next = pickNextSupplier(options, line.supplier_id)
        }
        await notifyTeam({
          tenant_id: line.tenant_id, dedupe_key: `service-booking:${line.id}`, type: 'service_booking',
          ...expiredBell(line, next, line.cost_currency), link,
        })
      } else if (reminderDue(line, now, remindedSince(events ?? [], line.id, line.requested_at))) {
        const logged = await recordServiceBookingEvent(db, {
          tenantId: line.tenant_id, bookingId: line.booking_id, serviceBookingId: line.id,
          actor: 'system', channel: 'system', note: 'No answer yet — reminder suggested', details: { kind: REMINDER_DUE },
        })
        // Not logged = it would nudge again every 5 minutes; skip the bell.
        if (!logged.ok) { failures.push(`${line.id}: ${logged.error}`); continue }
        nudged++
        await notifyTeam({
          tenant_id: line.tenant_id, dedupe_key: `service-booking:${line.id}`, type: 'service_booking',
          ...reminderBell(line, now), link,
        })
      }
    } catch (e) {
      failures.push(`${line.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ success: failures.length === 0, waiting: lines.length, expired, nudged, failures })
}

export const GET = withJobRun('service-booking-deadlines', () => createAdminClient(), getHandler)
