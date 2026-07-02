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

  console.log(`cron-agent-memory: ok — ${body}`)
  process.exit(0)
} catch (err) {
  console.error('cron-agent-memory: request failed:', err)
  process.exit(1)
}
