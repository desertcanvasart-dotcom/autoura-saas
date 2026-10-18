#!/usr/bin/env node
/**
 * Send scheduled emails when they are due — every 5 minutes.
 *
 * Calls GET /api/cron/scheduled-send, which sends each scheduled email whose
 * time has come (the inbox composer's "Schedule send", migration 421). An
 * email therefore goes out within about five minutes of the time chosen.
 *
 * Exits 1 when any email failed to send, so Railway records a bad run as bad
 * (same rule as cron-gmail-sync.mjs). The person sees the failure, with its
 * reason, in their Scheduled list.
 *
 * DEPLOY (Railway) — .railway/railway.ts, service "cron:scheduled-send":
 *   Start command:  npm run cron:scheduled-send
 *   Schedule:       every 5 minutes (Railway's shortest)
 *   Env:            CRON_TARGET_URL (the site), CRON_SECRET (= the web service's)
 */

const base = process.env.CRON_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL
const secret = process.env.CRON_SECRET

if (!base) {
  console.error('[scheduled-send] No CRON_TARGET_URL or NEXT_PUBLIC_APP_URL set — nothing to call.')
  process.exit(1)
}
if (!secret) {
  console.error('[scheduled-send] CRON_SECRET is not set. The endpoint fails closed, so this run would be rejected.')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/cron/scheduled-send`

try {
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`[scheduled-send] HTTP ${res.status}: ${body.error || 'no reason given'}`)
    process.exit(1)
  }
  const { due = 0, sent = 0, retrying = 0, failed = 0, interrupted = 0 } = body
  console.log(`[scheduled-send] ${sent}/${due} due email(s) sent, ${retrying} to retry, ${failed} failed, ${interrupted} interrupted`)
  if (failed > 0 || interrupted > 0) {
    for (const r of body.results || []) if (r.status === 'failed') console.error(`[scheduled-send]   ${r.id}: ${r.error}`)
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  console.error(`[scheduled-send] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
