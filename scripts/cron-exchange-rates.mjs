#!/usr/bin/env node
/**
 * Daily exchange-rate refresh cron entrypoint.
 *
 * WHY THIS EXISTS
 * ---------------
 * `exchange_rates` holds one live row per currency pair and is UPSERTed on
 * every refresh, so it can only ever answer "what is the rate now".
 * `exchange_rate_snapshots` (migration 234) is append-only and answers "what
 * was the rate on the day this hotel was paid" — which is what the per-trip
 * P&L, analytics and financial reports convert against.
 *
 * That history only exists if something writes to it on a schedule. This job
 * is that something. Without it every report falls back to today's live rate
 * and labels its own figures as approximations.
 *
 * WHY DAILY
 * ---------
 * Daily is the granularity accounting actually uses (a daily closing rate),
 * and it is what the reports resolve against — they ask for "the newest rate
 * on or before this transaction date". Running hourly would multiply the
 * table by 24 without making a single margin more accurate.
 *
 * The upstream call is cheap: fetchAllExchangeRates() makes ONE request to
 * the rate provider (EUR base) and derives the inverse pairs arithmetically,
 * so this is ~30 requests/month against a 1,500/month free tier.
 *
 * DEPLOY (Railway)
 * ----------------
 * Railway has no `[[cron]]` table in railway.toml — cron is configured
 * per-service in the dashboard, and it runs that service's START COMMAND,
 * which must exit when done. So this needs its own service:
 *
 *   Start Command: npm run cron:exchange-rates
 *   Cron Schedule: 0 1 * * *        (01:00 UTC daily)
 *   Env:           APP_URL, CRON_SECRET
 *
 * 01:00 UTC sits after the provider's daily update and before the 02:00
 * agent-memory job, so the two crons do not overlap.
 *
 * CRON_SECRET must match the value on the WEB service — the endpoint compares
 * them directly and falls through to session auth (401) when they differ.
 */

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
const cronSecret = process.env.CRON_SECRET

if (!appUrl) {
  console.error('cron-exchange-rates: APP_URL (or NEXT_PUBLIC_APP_URL) is not set')
  process.exit(1)
}
if (!cronSecret) {
  console.error('cron-exchange-rates: CRON_SECRET is not set')
  process.exit(1)
}

// NOT /api/exchange-rates/refresh — middleware.ts gates that behind a session
// (it is the admin-UI route). `/api/cron/` is the allowlisted prefix for
// CRON_SECRET-authenticated jobs, so the scheduled run has its own endpoint.
// It forces past the 1-hour freshness guard by default: skipping because a
// rate is "fresh" would leave a gap in the very history this job builds.
const endpoint = `${appUrl.replace(/\/$/, '')}/api/cron/refresh-exchange-rates`

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': cronSecret },
  })

  const body = await res.text()
  if (!res.ok) {
    console.error(`cron-exchange-rates: ${endpoint} returned ${res.status}: ${body}`)
    process.exit(1)
  }

  // Surface the pair count so a Railway run log shows whether history actually grew.
  // Surface the HISTORY write, not just the HTTP status. The live-rate upsert
  // can succeed while the snapshot insert fails, and that failure is the one
  // that quietly degrades every future margin calculation — so a run that
  // wrote no snapshots must not read as a clean success.
  let detail = body
  let snapshotsWritten = null
  let snapshotError = null
  try {
    const parsed = JSON.parse(body)
    snapshotsWritten = parsed.snapshotsWritten ?? null
    snapshotError = parsed.snapshotError ?? null
    detail = `${parsed.message || 'ok'} (fetchedAt=${parsed.fetchedAt || 'n/a'}, rates=${parsed.ratesRefreshed ?? 'n/a'}, snapshots=${snapshotsWritten ?? 'n/a'})`
  } catch {
    /* non-JSON body — log it raw */
  }

  if (snapshotError) {
    console.error(`cron-exchange-rates: rates refreshed but history write FAILED — ${snapshotError}`)
    process.exit(1)
  }

  console.log(`cron-exchange-rates: ok — ${detail}`)
  process.exit(0)
} catch (err) {
  console.error('cron-exchange-rates: request failed:', err)
  process.exit(1)
}
