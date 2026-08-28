// ============================================
// GET /api/health/deep — is this install actually well?
// ============================================
// S2 of docs/plans/self-hosted-support.md. /api/health answers "is the process
// up and can it reach the database", and is public, so it must stay
// secret-free and vague. This one is gated, so it can afford to say WHICH
// dependency is unhappy and whether the scheduled jobs have stopped.
//
// It exists for a self-hosted customer's own monitoring: they have no platform
// dashboard, and "the process is running" is not the failure they need to hear
// about. Silent failures — a scheduler that stopped, so every historical
// conversion falls back to today's rate — are what this catches.
//
// TWO WAYS IN, because a monitor cannot hold a session:
//   * a super-admin session (theirs, not ours), or
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
  // stopped scheduler is reported but does NOT page: it is a real problem and
  // it is not an outage, and a monitor that cries wolf gets muted.
  const ok = state.database.reachable && !Object.values(state.integrations).includes('failed')

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
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}
