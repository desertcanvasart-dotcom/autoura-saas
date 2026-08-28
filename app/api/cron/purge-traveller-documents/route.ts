// ============================================
// /api/cron/purge-traveller-documents — retention sweep (C1b)
// ============================================
// Passport scans are the most sensitive thing this system holds; the promise
// made at upload is that we do not keep them past the trip. This executes
// that promise: it deletes the OBJECT and keeps the ROW stamped purged_at —
// the record that we held a document and destroyed it on schedule. The
// extracted text fields on booking_passengers are untouched.
//
// purge_after is READ, never recomputed — stamped at upload from the
// booking's end date precisely so moving a booking later cannot silently
// extend how long a passport image is retained.
//
// Bearer-auth like the other crons (CRON_SECRET); invoked daily by
// scripts/cron-reminders.mjs alongside the reminder sweeps.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'
import { withJobRun } from '@/lib/support/job-runs'

export const dynamic = 'force-dynamic'

/** Storage removes in batches; one call with thousands of keys can time out
 *  halfway and leave you unsure what happened. */
const BATCH = 50

async function getHandler(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: due, error } = await supabase
      .from('booking_passenger_documents')
      .select('id, storage_path')
      .is('purged_at', null)
      .not('purge_after', 'is', null)
      .lte('purge_after', now)
      .limit(500)
    if (error) {
      // Table absent = migration 301 pending; nothing to purge.
      return NextResponse.json({ success: true, purged: 0, note: 'table not available' })
    }

    let purged = 0
    const failures: string[] = []
    for (let i = 0; i < (due ?? []).length; i += BATCH) {
      const batch = due!.slice(i, i + BATCH)
      const { error: removeError } = await supabase.storage
        .from(TRAVELLER_DOCS_BUCKET)
        .remove(batch.map(d => d.storage_path))
      if (removeError) {
        // Do NOT stamp purged_at for a batch whose objects may still exist —
        // the stamp must mean the file is gone.
        failures.push(removeError.message)
        continue
      }
      const { error: stampError } = await supabase
        .from('booking_passenger_documents')
        .update({ purged_at: now })
        .in('id', batch.map(d => d.id))
      if (stampError) failures.push(stampError.message)
      else purged += batch.length
    }

    return NextResponse.json({ success: failures.length === 0, purged, failures })
  } catch (err) {
    console.error('[purge-traveller-documents]', err)
    return NextResponse.json({ success: false, error: 'Purge failed' }, { status: 500 })
  }
}

// ============================================
// Recorded, so the support bundle can answer "has this job ever run here?"
// ============================================
// Nothing in this app schedules itself — the scheduler is external, so the job
// saying so is the only evidence it ever ran. Fail-open: if the recording cannot
// happen, the job still runs (lib/support/job-runs.ts).
export const GET = withJobRun('purge-traveller-documents', () => createAdminClient(), getHandler)
