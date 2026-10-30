#!/usr/bin/env node
/**
 * Announce new email while Autoura is closed — every 5 minutes.
 *
 * Calls GET /api/cron/mail-alerts, which checks every connected Gmail for new
 * Primary mail and files one bell item per email — ringing the owner's phone
 * or desktop. (Operator, 2026-09-24: nobody keeps the computer open all day.)
 *
 * Also calls GET /api/cron/service-booking-deadlines (Supplier Network step 5):
 * a supplier request unanswered halfway to its deadline rings the bell to send
 * a reminder; past the deadline the line goes back to the office with the next
 * supplier named. Same 5-minute beat, so it shares this service rather than
 * needing a new Railway cron (docs/CRON-JOBS.md: one config per service is
 * the mistake to make once, not twice). Both are called even if one fails.
 *
 * Exits 1 when any mailbox or any request failed, so Railway records a bad
 * run as bad (same rule as cron-gmail-sync.mjs).
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

const root = base.replace(/\/$/, '')

async function call(tag, path, report) {
  try {
    const res = await fetch(`${root}${path}`, { headers: { authorization: `Bearer ${secret}` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[${tag}] HTTP ${res.status}: ${body.error || 'no reason given'}`)
      return false
    }
    return report(body)
  } catch (err) {
    console.error(`[${tag}] ${err instanceof Error ? err.message : err}`)
    return false
  }
}

const mail = await call('mail-alerts', '/api/cron/mail-alerts', (body) => {
  const { mailboxes = 0, checked = 0, failed = 0 } = body
  console.log(`[mail-alerts] ${checked}/${mailboxes} mailboxes checked, ${failed} failed`)
  for (const r of body.results || []) if (!r.ok) console.error(`[mail-alerts]   ${r.email}: ${r.error}`)
  return failed === 0
})

const deadlines = await call('service-booking-deadlines', '/api/cron/service-booking-deadlines', (body) => {
  const { waiting = 0, nudged = 0, expired = 0, failures = [] } = body
  console.log(`[service-booking-deadlines] ${waiting} waiting, ${nudged} reminder(s) suggested, ${expired} past deadline`)
  for (const f of failures) console.error(`[service-booking-deadlines]   ${f}`)
  return failures.length === 0
})

process.exit(mail && deadlines ? 0 : 1)
