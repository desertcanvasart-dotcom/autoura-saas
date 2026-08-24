#!/usr/bin/env node
/**
 * Daily reminder sweeps — invoice dunning and task due/overdue notices.
 *
 * WHY THIS EXISTS
 * ---------------
 * `app/api/cron/send-reminders` and `app/api/cron/task-reminders` have existed
 * for months and NOTHING HAS EVER CALLED THEM. There was no runner script, no
 * npm script, and no Railway config — `package.json` had exactly two cron
 * entries (exchange rates, agent memory) and neither was these. Both endpoints
 * authenticate, query and return 200; they were simply never invoked.
 *
 * Nothing surfaced that. An endpoint nobody calls raises no error, fails no
 * test and appears in the codebase looking finished.
 *
 * WHY ONE SERVICE FOR TWO JOBS
 * ----------------------------
 * Each Railway cron service must be pointed at its own config file or it
 * silently inherits railway.toml's `npm run start`, boots a Next.js server
 * that never exits, and bills for a web server while the job never fires
 * (docs/CRON-JOBS.md). That mistake is per-service, so two jobs sharing one
 * service is one chance to make it instead of two. They are the same concern
 * at the same hour, and this script reports them separately, so the coupling
 * costs nothing in observability.
 *
 * Both endpoints are called even if the first fails — one broken sweep must
 * not hide the state of the other.
 *
 * WHY THE EXIT CODE IS NOT JUST THE HTTP STATUS
 * ---------------------------------------------
 * Railway records the run from the exit code, and BOTH endpoints answer 200
 * with a summary that can describe a failed night:
 *
 *   send-reminders   200 with failed > 0        (dunning emails did not send)
 *   task-reminders   200 with results.errors[]  (a query or insert failed)
 *
 * Exiting 0 on any 200 would make those nights indistinguishable from healthy
 * ones — the exact quiet degradation this job exists to prevent.
 *
 * DEPLOY (Railway)
 * ----------------
 *   Service        Start command (stored on the service)   Cron (UTC)
 *   Reminders      npm run cron:reminders                  0 6 * * *
 *
 *   Config-as-Code was retired 2026-08-24; the start command is stored on
 *   the service itself and the topology lives in .railway/railway.ts.
 *   Env: APP_URL, CRON_SECRET (must match the WEB service's value).
 *
 * 06:00 UTC is ~08:00-09:00 in Egypt, which is what task-reminders' own header
 * asks for ("Recommended: Run daily at 8:00 AM local time"), and it sits after
 * the 01:00 exchange-rates and 02:00 agent-memory jobs.
 */

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
const cronSecret = process.env.CRON_SECRET

if (!appUrl) {
  console.error('cron-reminders: APP_URL (or NEXT_PUBLIC_APP_URL) is not set')
  process.exit(1)
}
if (!cronSecret) {
  console.error('cron-reminders: CRON_SECRET is not set')
  process.exit(1)
}

const base = appUrl.replace(/\/$/, '')

/**
 * Both routes export GET and authenticate with `Authorization: Bearer`.
 * (The exchange-rates job uses POST + `x-cron-secret`; the two conventions
 * differ and this must match the handler it actually calls.)
 */
async function run(name, path, describe) {
  const url = `${base}${path}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    const body = await res.text()

    if (!res.ok) {
      console.error(`cron-reminders: ${name} returned ${res.status}: ${body.slice(0, 300)}`)
      return false
    }

    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      console.error(`cron-reminders: ${name} answered 200 with a non-JSON body: ${body.slice(0, 200)}`)
      return false
    }

    const problem = describe(parsed)
    if (problem) {
      console.error(`cron-reminders: ${name} reported success but ${problem}`)
      return false
    }

    console.log(`cron-reminders: ${name} ok — ${parsed.message || 'done'}`)
    return true
  } catch (err) {
    console.error(`cron-reminders: ${name} request failed:`, err)
    return false
  }
}

const invoices = await run(
  'send-reminders',
  '/api/cron/send-reminders',
  (p) => (p.failed > 0 ? `${p.failed} reminder email(s) FAILED to send` : null)
)

const tasks = await run(
  'task-reminders',
  '/api/cron/task-reminders',
  (p) => {
    const errs = p.results?.errors ?? []
    return errs.length > 0 ? `${errs.length} error(s): ${errs.join('; ')}` : null
  }
)

process.exit(invoices && tasks ? 0 : 1)
