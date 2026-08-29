// ============================================
// The support bundle — RUNTIME CORE
// ============================================
// Plain JavaScript on purpose, mirroring scripts/migrate-core.mjs: the same
// logic has to run inside the Next app (TypeScript) AND inside
// scripts/doctor.mjs, which is a bare node script that cannot import .ts. The
// typed surface is lib/support/bundle.ts, which re-exports this file.
//
// The support bundle — a redacted diagnostic snapshot of this instance
// S1 of docs/plans/self-hosted-support.md (read its correction header). When an install goes
// wrong, this is what crosses the gap: one file the customer generates, reads,
// and emails. Most "it's broken" reports are answered by two lines of it —
// usually a missing environment variable or an unapplied migration.
//
// EVERYTHING HERE IS PURE, because the redaction is the load-bearing part and
// a bundle that leaks is worse than no bundle. What the customer hands over
// must be decidable from these functions alone, and provable by tests.
//
// THREE RULES, and every field in the bundle obeys them:
//
//   NAMES, NOT VALUES.   Environment variables are reported as set or missing.
//                        No value ever leaves the server, not even a prefix —
//                        "sk_live_51H..." is enough to identify an account.
//   COUNTS, NOT ROWS.    How many bookings, never whose. No client names, no
//                        emails, no passport anything.
//   SCRUBBED, NOT RAW.   Error lines go through redactText, which removes
//                        anything shaped like an address, a key or an id.
//
// And the allow-list is OURS. A customer's own environment variable — their
// internal API keys, their hostnames — is never reported at all, not even by
// name, because we did not ask them to have it and it is not ours to see.

/** Environment variables this product knows about, by name. Anything not on
 *  this list is invisible to the bundle: it belongs to the customer, not us. */
export const KNOWN_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'SUPER_ADMIN_EMAILS',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'OAUTH_STATE_SECRET',
  'WHATSAPP_PROVIDER',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'META_WHATSAPP_ACCESS_TOKEN',
  'META_WHATSAPP_PHONE_NUMBER_ID',
  'META_WHATSAPP_APP_SECRET',
  'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'EXCHANGE_RATE_API_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'CRON_SECRET',
  'CONCIERGE_WEBHOOK_SECRET',
  'GIT_SHA',
  'PORT',
]

/** The ones without which the app does not work at all. */
export const REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

/**
 * Which known variables are set. NEVER their values.
 *
 * A variable present but empty counts as missing: `STRIPE_SECRET_KEY=` in a
 * .env file is a variable somebody meant to fill in.
 */
export function reportEnv(env) {
  const set = []
  const missing = []
  for (const key of KNOWN_ENV_KEYS) {
    const value = env[key]
    if (typeof value === 'string' && value.trim() !== '') set.push(key)
    else missing.push(key)
  }
  return {
    set,
    missing,
    missingRequired: REQUIRED_ENV_KEYS.filter(k => missing.includes(k)),
  }
}

// ============================================
// Scrubbing
// ============================================
// Ordered widest-first: a JWT contains base64 that would otherwise be caught by
// a narrower rule and half-redacted, which is worse than not redacting it at
// all because it looks safe.

const REDACTIONS = [
  // JSON Web Tokens — Supabase anon and service-role keys are both JWTs.
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '[jwt]'],
  // Postgres / URL credentials: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://[credentials]@'],
  // Vendor-prefixed keys: sk_live_…, rk_…, whsec_…, sk-ant-…, SG.…, xoxb-…
  [/\b(?:sk|pk|rk|whsec|sk-ant|SG|xox[baprs])[-_][A-Za-z0-9_-]{8,}/g, '[key]'],
  // Authorization headers, however they are spelled. The scheme word is part
  // of what gets eaten: "Authorization: Bearer abc" must not redact "Bearer"
  // and leave "abc" standing, which is what a single \S+ did.
  [/\b(authorization|api[-_]?key|apikey|token|bearer|basic)\b\s*[:=]?\s*(?:(?:bearer|basic)\s+)?\S+/gi, '$1 [redacted]'],
  // Email addresses — a customer's travellers are in these logs.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  // UUIDs identify a person as surely as their name does.
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  // Anything long and secret-shaped that the rules above did not name.
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]'],
  // Passport-ish: two letters and six or more digits, run together.
  [/\b[A-Z]{1,2}\d{6,9}\b/g, '[document-number]'],
]

/**
 * Make one line of text safe to send.
 *
 * Applied to every error line and every free-text field in the bundle. It errs
 * toward over-redacting: an over-redacted log still tells us WHICH error
 * happened and where, which is almost always the part we need.
 */
export function redactText(input) {
  let text = typeof input === 'string' ? input : String(input ?? '')
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement)
  return text
}

/** Keep the most recent lines, scrubbed, and cap the length of each — a stack
 *  trace with a rendered payload in it can run to megabytes. */
export function redactErrorLines(lines, limit = 20) {
  return lines
    .slice(-limit)
    .map(line => redactText(line))
    .map(line => (line.length > 400 ? `${line.slice(0, 400)}…` : line))
}

// ============================================
// The bundle
// ============================================

/** How long after a job's last run we start calling it stale. Every scheduled
 *  job in this product is daily or more frequent, so two days of silence is a
 *  scheduler that stopped — the failure mode that makes reports quietly wrong
 *  rather than making them error. Lives here, with the finding that uses it, so
 *  the number and the message cannot drift apart. */
export const STALE_AFTER_HOURS = 48

export const REDACTION_NOTICE = [
  'Environment variables appear by NAME only — no value, not even a prefix.',
  'Table figures are COUNTS only — no names, emails, passports or any row content.',
  'Error lines are scrubbed of addresses, keys, tokens, ids and document numbers.',
  'Only variables this product defines are listed; your own are not reported at all.',
  'HOSTNAMES CAN APPEAR. A failure like "ENOTFOUND db.internal" keeps the host, because which host failed is the useful half of the message. Nothing else about your infrastructure is collected.',
]

/** Assemble the bundle. The only way one is built — so the redaction cannot be
 *  skipped by a caller assembling the object itself. */
export function buildBundle(parts) {
  return {
    generatedAt: parts.generatedAt,
    app: {
      version: parts.version,
      sha: parts.sha,
      node: parts.node,
      uptimeSeconds: parts.uptimeSeconds ?? null,
    },
    database: {
      ...parts.database,
      ...(parts.database.error ? { error: redactText(parts.database.error) } : {}),
    },
    env: reportEnv(parts.env),
    integrations: parts.integrations ?? {},
    crons: parts.crons ?? [],
    counts: parts.counts ?? {},
    recentErrors: redactErrorLines(parts.errors ?? []),
    redaction: REDACTION_NOTICE,
  }
}

/**
 * The one-screen summary: what is wrong, in the order it should be read.
 *
 * Exists so nobody has to interpret JSON during an incident — the customer can
 * often fix it themselves from this, which is the whole point.
 */
export function bundleFindings(bundle) {
  const findings = []

  if (bundle.env.missingRequired.length) {
    findings.push(`Required environment variables are missing: ${bundle.env.missingRequired.join(', ')}. The app cannot work without them.`)
  }
  if (!bundle.database.reachable) {
    findings.push(`The database is not reachable${bundle.database.error ? ` (${bundle.database.error})` : ''}. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and that the project is running.`)
  }
  const pending = bundle.database.migrationsPending
  if (pending && pending.length) {
    findings.push(`${pending.length} migration${pending.length === 1 ? '' : 's'} not applied, starting with ${pending[0]}. Run: DATABASE_URL=… node scripts/migrate.mjs`)
  }
  for (const [name, state] of Object.entries(bundle.integrations)) {
    if (state === 'failed') findings.push(`${name} is configured but not responding.`)
  }
  const neverRun = bundle.crons.filter(c => c.lastRun === null).map(c => c.name)
  if (neverRun.length === bundle.crons.length && bundle.crons.length > 0) {
    // All of them, which is one problem — no scheduler — not five problems.
    findings.push(`No scheduled job has ever run on this install. Set up your scheduler: see "Scheduled jobs" in docs/OPERATIONS.md. Until then exchange rates never refresh, and every historical conversion in the reports quietly falls back to today's rate.`)
  } else if (neverRun.length) {
    findings.push(`These jobs have never run here: ${neverRun.join(', ')}. Check your scheduler covers all of them — see docs/OPERATIONS.md.`)
  }

  for (const cron of bundle.crons) {
    if (!cron.lastRun) continue
    const age = Date.now() - Date.parse(cron.lastRun)
    if (Number.isFinite(age) && age > STALE_AFTER_HOURS * 3600000) {
      findings.push(`The "${cron.name}" job last ran ${Math.floor(age / 3600000)} hours ago and should run at least daily. Its schedule has probably stopped.`)
    }
    if (cron.lastOutcome === 'failed') {
      findings.push(`The "${cron.name}" job's last run FAILED.`)
    }
    if (cron.lastOutcome === 'unfinished') {
      findings.push(`The "${cron.name}" job started and never reported back — the process was probably killed mid-run.`)
    }
  }
  if (bundle.app.sha === 'unknown') {
    findings.push('The running commit is unknown — GIT_SHA was not baked into the build, so we cannot tell which version this is.')
  }

  if (!findings.length) findings.push('No problems found by these checks.')
  return findings
}
