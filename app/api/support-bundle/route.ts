// ============================================
// GET /api/support-bundle — what a self-hosted install can safely send us
// ============================================
// S1 of docs/plans/self-hosted-support.md. On an install we do not run, this is
// the thing that crosses the gap: the customer's OWN super-admin generates it,
// reads it, and emails it.
//
// Gated on super-admin — theirs, not ours. We have no account on their server
// and never will; this is something they operate, not something we reach into.
//
// Every field goes through lib/support/bundle.ts, which is where the redaction
// lives and where it is tested. Nothing is assembled here by hand.
//
// WHAT THIS CANNOT SEE, and scripts/doctor.mjs can:
//   * which migrations are PENDING — that needs the migration files, which are
//     not in the built image. The applied count is here; the diff is there.
//   * anything at all when the app will not start, which is exactly when it
//     matters most. The script answers both.

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { buildBundle, bundleFindings } from '@/lib/support/bundle'
import { collectState } from '@/lib/support/collect'
import { version as appVersion } from '../../../package.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  // The same collector the deep health probe uses, so the two can never
  // disagree about whether this install is well.
  const state = await collectState()

  const bundle = buildBundle({
    generatedAt: new Date().toISOString(),
    version: appVersion,
    sha: process.env.GIT_SHA || 'unknown',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database: state.database,
    env: process.env as Record<string, string | undefined>,
    integrations: state.integrations,
    crons: state.crons,
    counts: state.counts,
    // No error store exists yet. scripts/doctor.mjs --logs <file> scrubs a log
    // the customer points it at, which is where these come from until there is
    // somewhere to keep them.
    errors: [],
  })

  return NextResponse.json({ success: true, findings: bundleFindings(bundle), bundle })
}
