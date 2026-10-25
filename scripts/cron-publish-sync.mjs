#!/usr/bin/env node
/**
 * Keep Publish sites in step with Autoura records — every 5 minutes.
 *
 * Calls GET /api/cron/publish-sync, which turns each logged product, rate,
 * departure, company-identity or exchange-rate change into a refresh of the
 * pages that show it, and records each enrolled company's sync health
 * (docs/publish/PLAN.md §5).
 *
 * Exits 1 when any company is failing or a change could not be read, so
 * Railway records a bad run as bad (same rule as cron-gmail-sync.mjs).
 *
 * DEPLOY (Railway) — .railway/railway.ts, service "cron:publish-sync":
 *   Start command:  npm run cron:publish-sync
 *   Schedule:       every 5 minutes (Railway's shortest)
 *   Env:            CRON_TARGET_URL (the site), CRON_SECRET (= the web service's)
 */

const base = process.env.CRON_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL
const secret = process.env.CRON_SECRET

if (!base) {
  console.error('[publish-sync] No CRON_TARGET_URL or NEXT_PUBLIC_APP_URL set — nothing to call.')
  process.exit(1)
}
if (!secret) {
  console.error('[publish-sync] CRON_SECRET is not set. The endpoint fails closed, so this run would be rejected.')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/cron/publish-sync`

try {
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`[publish-sync] HTTP ${res.status}: ${body.error || 'no reason given'}`)
    process.exit(1)
  }
  console.log(`[publish-sync] ${body.summary || 'no summary'}`)
  if (body.success === false) {
    for (const r of body.results || []) if (r.error) console.error(`[publish-sync]   ${r.tenantId}: ${r.error}`)
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  console.error(`[publish-sync] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
