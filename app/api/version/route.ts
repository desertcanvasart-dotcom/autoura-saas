// ============================================
// API: /api/version — deploy verification
// ============================================
// Public (middleware-allowlisted), unauthenticated, secret-free. Exists so a
// deploy can be verified by COMMIT, not by a "success" status — deploy drift
// (an old build still serving) has repeatedly masked already-merged fixes.
// Checked by scripts/verify-deploy.mjs.
//
// SHA resolution order:
//   1. GIT_SHA env — the deploy pipeline should bake this in (Docker:
//      `ARG GIT_SHA` + `ENV GIT_SHA=$GIT_SHA`, built with
//      `--build-arg GIT_SHA=$(git rev-parse HEAD)`), since .git usually
//      isn't in the runtime image.
//   2. `git rev-parse HEAD` — works in dev and any from-checkout run.
//   3. 'unknown' — verify-deploy treats this as a failure with instructions.
// ============================================

import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { version as appVersion } from '../../../package.json'

export const dynamic = 'force-dynamic'

const startedAt = new Date().toISOString()

function resolveSha(): { sha: string; shaSource: 'env' | 'railway' | 'git' | 'unknown' } {
  if (process.env.GIT_SHA) return { sha: process.env.GIT_SHA, shaSource: 'env' }
  // Prod deploys on Railway (dashboard-managed build, no Dockerfile) —
  // Railway injects the deployed commit for GitHub-linked services.
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return { sha: process.env.RAILWAY_GIT_COMMIT_SHA, shaSource: 'railway' }
  }
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    if (/^[0-9a-f]{40}$/.test(sha)) return { sha, shaSource: 'git' }
  } catch {
    /* no git binary or not a checkout (e.g. runtime container) */
  }
  return { sha: 'unknown', shaSource: 'unknown' }
}

// Cache: the SHA cannot change within a running server process.
const resolved = resolveSha()

export async function GET() {
  return NextResponse.json({
    sha: resolved.sha,
    shaSource: resolved.shaSource,
    appVersion,
    nodeEnv: process.env.NODE_ENV,
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
  })
}
