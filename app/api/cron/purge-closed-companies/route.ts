import { bearerMatches } from '@/lib/support/probe-auth'
// ============================================
// /api/cron/purge-closed-companies — delete companies whose 30 days are up
// ============================================
// An owner's "Close company" (app/api/account/company) leaves the data in
// place for CLOSURE_GRACE_DAYS so it can be exported (Terms 6.3); this keeps
// the other half of that promise — after that, it is deleted. What is deleted,
// and in what order, is lib/account/company-closure.ts.
//
// Bearer-auth like the other crons (CRON_SECRET); invoked daily by
// scripts/cron-reminders.mjs.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { purgeCompany } from '@/lib/account/company-closure'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** A few a night: each walks every bucket and table of a company. */
const PER_RUN = 5

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: due, error } = await admin
    .from('tenant_closures')
    .select('tenant_id')
    .lte('purge_after', new Date().toISOString())
    .order('purge_after')
    .limit(PER_RUN)
  if (error) {
    console.error('[purge-closed-companies]', error)
    return NextResponse.json({ success: false, purged: 0, failures: [`reading closures: ${error.message}`] }, { status: 500 })
  }

  let purged = 0
  const failures: string[] = []
  const warnings: string[] = []
  for (const { tenant_id } of due ?? []) {
    try {
      const summary = await purgeCompany(admin, tenant_id)
      purged++
      warnings.push(...summary.problems.map(p => `${tenant_id}: ${p}`))
    } catch (err) {
      failures.push(`${tenant_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    message: `Companies deleted: ${purged}`,
    purged,
    failures,
    warnings,
  })
}

export const GET = withJobRun('purge-closed-companies', () => createAdminClient(), getHandler)
