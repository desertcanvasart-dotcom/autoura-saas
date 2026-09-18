#!/usr/bin/env node
/**
 * Pull every connected mailbox, every ten minutes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Email only arrived when somebody opened the inbox and pressed sync. A
 * customer who wrote on Friday evening sat unseen until Monday morning, and
 * the "waiting on us" work is worth nothing if the messages that start the
 * clock only appear when someone goes looking.
 *
 * WHY IT CALLS THE ENDPOINT RATHER THAN SYNCING HERE
 * --------------------------------------------------
 * There is one sync implementation, the one people use by hand. A second copy
 * living in a script would drift from it — quietly, and in the direction
 * nobody is watching.
 *
 * WHY THE EXIT CODE IS NOT JUST THE HTTP STATUS
 * ---------------------------------------------
 * Railway records the run from the exit code, and the endpoint answers 200
 * with a summary that can describe a bad run: some mailboxes synced, others
 * refused. Exiting 0 on any 200 would make those runs indistinguishable from
 * healthy ones — the quiet degradation this job exists to prevent. A run with
 * ANY failed mailbox exits 1.
 *
 * DEPLOY (Railway)
 * ----------------
 * Its own service, pointed at this script:
 *   Start command:  npm run cron:gmail-sync
 *   Schedule:       every 10 minutes
 * A cron service without its own start command inherits the web service's and
 * boots a Next.js server that never exits — see docs/CRON-JOBS.md.
 */

const base = process.env.CRON_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL
const secret = process.env.CRON_SECRET

if (!base) {
  console.error('[gmail-sync] No CRON_TARGET_URL or NEXT_PUBLIC_APP_URL set — nothing to call.')
  process.exit(1)
}
if (!secret) {
  console.error('[gmail-sync] CRON_SECRET is not set. The endpoint fails closed, so this run would be rejected.')
  process.exit(1)
}

const url = `${base.replace(/\/$/, '')}/api/cron/gmail-sync`

try {
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error(`[gmail-sync] HTTP ${res.status}: ${body.error || 'no reason given'}`)
    process.exit(1)
  }

  const { mailboxes = 0, synced = 0, failed = 0, messages = 0 } = body
  console.log(`[gmail-sync] ${synced}/${mailboxes} mailboxes synced, ${messages} new message(s), ${failed} failed`)

  if (failed > 0) {
    for (const r of body.results || []) {
      if (!r.ok) console.error(`[gmail-sync]   ${r.user_id}: ${r.error}`)
    }
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  console.error(`[gmail-sync] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
