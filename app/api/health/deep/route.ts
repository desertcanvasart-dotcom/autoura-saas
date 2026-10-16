// ============================================
// GET /api/health/deep — is this install actually well?
// ============================================
// S2 of docs/plans/self-hosted-support.md (read its correction header).
// /api/health answers "is the process up and can it reach the database", and
// is public, so it must stay
// secret-free and vague. This one is gated, so it can afford to say WHICH
// dependency is unhappy and whether the scheduled jobs have stopped.
//
// It exists for uptime monitoring, because "the process is running" is not the
// failure worth hearing about. Silent failures — a scheduler that stopped, so
// every historical conversion falls back to today's rate — are what this
// catches.
//
// TWO WAYS IN, because a monitor cannot hold a session:
//   * a super-admin session, or
//   * Authorization: Bearer <CRON_SECRET>
//
// FAILS CLOSED. This route sits under the '/api/health' prefix, which
// middleware lets through without a session — so this handler is the only
// thing in front of it. With CRON_SECRET unset and no session, nobody gets in.

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { collectState } from '@/lib/support/collect'
import { bearerMatches } from '@/lib/support/probe-auth'
import { bundleFindings, buildBundle } from '@/lib/support/bundle'
import { jobsNeedAttention } from '@/lib/support/job-health'
import { version as appVersion } from '../../../../package.json'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const byToken = bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)
  if (!byToken) {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const state = await collectState()

  // The findings are computed from a bundle so that a monitor and a support
  // bundle never disagree about what counts as a problem.
  const findings = bundleFindings(
    buildBundle({
      generatedAt: new Date().toISOString(),
      version: appVersion,
      sha: process.env.GIT_SHA || 'unknown',
      node: process.version,
      database: state.database,
      env: process.env as Record<string, string | undefined>,
      integrations: state.integrations,
      crons: state.crons,
      counts: state.counts,
    })
  )

  // 503 when a dependency is actually down, so an uptime monitor pages. A
  // stopped scheduler is reported but does NOT page by default: it is a real
  // problem and it is not an outage, and a monitor that cries wolf gets muted.
  // ?strict=1 is for a second, lower-urgency monitor that SHOULD hear about it:
  // it also answers 503 when any job is stale, failed or never reported back.
  const healthy = state.database.reachable && !Object.values(state.integrations).includes('failed')
  const strict = request.nextUrl.searchParams.get('strict') === '1'
  const jobTrouble = jobsNeedAttention(state.crons)
  const ok = healthy && (!strict || jobTrouble.length === 0)

  return NextResponse.json(
    {
      ok,
      checks: {
        database: state.database,
        integrations: state.integrations,
        crons: state.crons,
      },
      counts: state.counts,
      findings,
      jobsNeedingAttention: jobTrouble,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}
