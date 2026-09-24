#!/usr/bin/env node
/**
 * Announce new email while Autoura is closed — every 5 minutes.
 *
 * Calls GET /api/cron/mail-alerts, which checks every connected Gmail for new
 * Primary mail and files one bell item per email — ringing the owner's phone
 * or desktop. (Operator, 2026-09-24: nobody keeps the computer open all day.)
 *
 * Exits 1 when any mailbox failed, so Railway records a bad run as bad (same
 * rule as cron-gmail-sync.mjs).
 *
 * DEPLOY (Railway) — .railway/railway.ts, service "cron:mail-alerts":
 *   Start command:  npm run cron:mail-alerts
 *   Schedule:       every 5 minutes (Railway's shortest)
 *   Env:            CRON_TARGET_URL (the site), CRON_SECRET (= the web service's)
 */

const base = process.env.CRON_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL
const secret = process.env.CRON_SECRET

if (!base) {
  console.error('[mail-alerts] No CRON_TARGET_URL or NEXT_PUBLIC_APP_URL set — nothing to call.')
  process.exit(1)
}
if (!secret) {
  console.error('[mail-alerts] CRON_SECRET is not set. The endpoint fails closed, so this run would be rejected.')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/cron/mail-alerts`

try {
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`[mail-alerts] HTTP ${res.status}: ${body.error || 'no reason given'}`)
    process.exit(1)
  }
  const { mailboxes = 0, checked = 0, failed = 0 } = body
  console.log(`[mail-alerts] ${checked}/${mailboxes} mailboxes checked, ${failed} failed`)
  if (failed > 0) {
    for (const r of body.results || []) if (!r.ok) console.error(`[mail-alerts]   ${r.email}: ${r.error}`)
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  console.error(`[mail-alerts] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
