#!/usr/bin/env node
/**
 * Nightly agent-memory cron entrypoint.
 *
 * Railway runs a service's START COMMAND on its dashboard cron schedule and
 * requires the process to EXIT when done (see docs/reference/cron-jobs). The
 * old railway.toml `[[cron]]` block was inert — that syntax does not exist,
 * and its `-H 'x-cron-secret: $CRON_SECRET'` single-quoting sent the secret
 * literally, so the endpoint would have rejected it anyway.
 *
 * Deploy: a dedicated Railway service pointed at this repo with
 *   Start Command: npm run cron:agent-memory
 *   Cron Schedule: 0 2 * * *
 *   Env: APP_URL (public URL of the web service), CRON_SECRET (same value the
 *        web service uses).
 *
 * This POSTs to the existing endpoint with the secret in a header and exits
 * 0 on success / 1 on failure so Railway records the run correctly.
 */

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
const cronSecret = process.env.CRON_SECRET

if (!appUrl) {
  console.error('cron-agent-memory: APP_URL (or NEXT_PUBLIC_APP_URL) is not set')
  process.exit(1)
}
if (!cronSecret) {
  console.error('cron-agent-memory: CRON_SECRET is not set')
  process.exit(1)
}

const endpoint = `${appUrl.replace(/\/$/, '')}/api/cron/process-agent-memory`

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': cronSecret },
  })

  const body = await res.text()
  if (!res.ok) {
    console.error(`cron-agent-memory: ${endpoint} returned ${res.status}: ${body}`)
    process.exit(1)
  }

  // Report the WORK, not just the HTTP status.
  //
  // The endpoint processes each agent run independently and answers 200 with
  // a summary even when every one of them failed — `runs_failed` is the only
  // place that shows up. Exiting 0 on any 200 meant a night where nothing was
  // learned looked identical to a night where everything was, and the
  // scheduler recorded a green run either way. Same reasoning as
  // scripts/cron-exchange-rates.mjs, which fails on a lost history write.
  let summary = null
  try {
    summary = JSON.parse(body)
  } catch {
    // Non-JSON body from a 200 is not something this script can vouch for.
    console.error(`cron-agent-memory: unparseable response — ${body}`)
    process.exit(1)
  }

  const {
    runs_found = 0,
    runs_processed = 0,
    runs_failed = 0,
    memories_written = 0,
    memories_purged = 0,
    duration_ms = null,
  } = summary

  const detail =
    `found=${runs_found} processed=${runs_processed} failed=${runs_failed} ` +
    `written=${memories_written} purged=${memories_purged}` +
    (duration_ms !== null ? ` in ${duration_ms}ms` : '')

  // The route sets success:false only for a hard fetch error; treat a missing
  // flag as failure rather than assuming the good case.
  if (summary.success === false) {
    console.error(`cron-agent-memory: run reported failure — ${summary.error || detail}`)
    process.exit(1)
  }

  if (runs_failed > 0) {
    console.error(
      `cron-agent-memory: ${runs_failed} of ${runs_found} run(s) FAILED to process — ${detail}`
    )
    process.exit(1)
  }

  // Nothing to do is a legitimate outcome: no agent runs in the window.
  console.log(`cron-agent-memory: ok — ${detail}`)
  process.exit(0)
} catch (err) {
  console.error('cron-agent-memory: request failed:', err)
  process.exit(1)
}
