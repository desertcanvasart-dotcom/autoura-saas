// ============================================================
// app/api/cron/refresh-exchange-rates/route.ts
//
// Railway Cron Job — daily exchange-rate capture
// Schedule: 0 1 * * *  (01:00 UTC)
// Driver:   scripts/cron-exchange-rates.mjs  (npm run cron:exchange-rates)
// Setup:    docs/CRON-JOBS.md
//
// WHY THIS EXISTS SEPARATELY FROM /api/exchange-rates/refresh
// -----------------------------------------------------------
// middleware.ts gates every /api/* route behind a Supabase session, except a
// small allowlist of routes that authenticate themselves (SELF_AUTH_API_PREFIXES).
// `/api/cron/` is the registered prefix for CRON_SECRET-authenticated jobs.
//
// The admin refresh route is NOT on that allowlist — it is a session route for
// the settings UI. Its in-handler cron-secret branch was therefore unreachable
// from an actual cron caller: the middleware answered 401 first. Rather than
// widen the gate for a route that also serves interactive users, the scheduled
// job gets its own endpoint under the prefix built for exactly this.
//
// What it does: fetch current market rates, upsert the live `exchange_rates`
// table, and APPEND to `exchange_rate_snapshots` — the immutable history the
// per-trip P&L, analytics and financial reports convert against. Without this
// running, those reports silently fall back to today's rate for every past
// transaction and label their own figures as approximate.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshExchangeRates } from '@/lib/exchange-rate-refresh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lazy-init admin client (same pattern as the other cron routes)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function POST(request: NextRequest) {
  // Verify cron secret — same pattern as the other cron routes.
  // Fails closed: with CRON_SECRET unset, `null !== undefined` rejects.
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A scheduled run always records a data point. Skipping because a rate is
  // "fresh" would leave a gap in the very history this job exists to build;
  // `?force=false` is available for a manual poke that respects the guard.
  const force = new URL(request.url).searchParams.get('force') !== 'false'

  const result = await refreshExchangeRates(getSupabaseAdmin(), {
    force,
    apiKey: process.env.EXCHANGE_RATE_API_KEY,
  })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error || result.message },
      { status: 500 }
    )
  }

  // Report the history write explicitly. The live-rate upsert can succeed
  // while the snapshot insert fails, and that failure is the one that quietly
  // degrades every future margin calculation — so it belongs in the run log.
  return NextResponse.json({
    success: true,
    skipped: result.skipped,
    message: result.message,
    fetchedAt: result.fetchedAt,
    ratesRefreshed: result.ratesRefreshed,
    snapshotsWritten: result.snapshotsWritten,
    ...(result.snapshotError ? { snapshotError: result.snapshotError } : {}),
  })
}
