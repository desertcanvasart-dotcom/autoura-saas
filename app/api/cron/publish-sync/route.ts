import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { supabaseSyncStore } from '@/lib/publish/sync/store'
import { runSyncCycle } from '@/lib/publish/sync/worker'
import { createRevalidator } from '@/lib/publish/sync/revalidate'
import { sendSyncAlert } from '@/lib/publish/sync/alerts'

// ============================================
// Publish sync — every 5 minutes
// ============================================
// Works through publish_change_log (migration 439): each product, rate,
// departure, company-identity or exchange-rate change becomes a refresh of
// the pages that show it, sent to the site renderer; each enrolled company's
// health is updated and alerted on (lib/publish/sync). Answers
// { success: false } when any company is failing or a change could not be
// read, so job_runs and Railway record the run as failed.

const CRON_SECRET = process.env.CRON_SECRET

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const report = await runSyncCycle({
      store: supabaseSyncStore(createAdminClient()),
      revalidate: createRevalidator({
        rendererUrl: process.env.PUBLISH_RENDERER_URL,
        secret: process.env.PUBLISH_REVALIDATE_SECRET,
      }),
      alert: sendSyncAlert,
    })
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Publish sync could not run: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}

export const GET = withJobRun('publish-sync', () => createAdminClient(), getHandler)
