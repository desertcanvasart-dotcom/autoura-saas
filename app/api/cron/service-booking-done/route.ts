import { bearerMatches } from '@/lib/support/probe-auth'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { transitionServiceBooking } from '@/lib/bookings/service-booking-transition'
import { DONE_FROM, doneBefore, hasHappened } from '@/lib/bookings/service-booking-done'

// ============================================
// Covered lines become Done after their date (lib/bookings/service-booking-done)
// ============================================
// Daily, from the reminders cron service (scripts/cron-reminders.mjs). Quiet:
// no bell — the office already knew the line was covered.

const CRON_SECRET = process.env.CRON_SECRET
const MAX_PER_RUN = 1000

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient() as unknown as SupabaseClient
  const now = new Date()

  const { data, error } = await db
    .from('booking_supplier_status')
    .select('id, tenant_id, booking_id, status, service_date')
    .in('status', DONE_FROM as string[])
    .lt('service_date', doneBefore(now))
    .order('service_date', { ascending: true })
    .limit(MAX_PER_RUN)
  if (error) {
    return NextResponse.json({ success: false, error: `Could not read covered lines: ${error.message}` }, { status: 500 })
  }

  let done = 0
  const failures: string[] = []
  for (const line of (data ?? []) as Array<{ id: string; tenant_id: string; booking_id: string; status: string | null; service_date: string | null }>) {
    if (!hasHappened(line, now)) continue
    const moved = await transitionServiceBooking(db, line.tenant_id, {
      id: line.id, bookingId: line.booking_id, to: 'done', actor: 'system', channel: 'system',
      note: 'Service date passed', now,
    })
    // 409 = changed since we read it: nothing to do.
    if (moved.ok) done++
    else if (moved.status !== 409) failures.push(`${line.id}: ${moved.error}`)
  }

  return NextResponse.json({ success: failures.length === 0, done, failures, message: `${done} line(s) marked done` })
}

export const GET = withJobRun('service-booking-done', () => createAdminClient(), getHandler)
