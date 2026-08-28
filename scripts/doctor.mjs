#!/usr/bin/env node
// ============================================
// doctor — what is wrong with this install
// ============================================
// S1 of docs/plans/self-hosted-support.md. The half of the support bundle that
// works when the app does NOT, which is exactly when it matters: it talks to
// Postgres directly and reads the migration files off disk, so it needs neither
// a running server nor anything we host.
//
//   node scripts/doctor.mjs                    # check, print findings
//   node scripts/doctor.mjs --bundle           # also write support-bundle.json
//   node scripts/doctor.mjs --logs server.log  # include that log, scrubbed
//   node scripts/doctor.mjs --url https://…    # also probe a running app
//
// Reads DATABASE_URL and the Supabase variables from the environment or
// .env.local.
//
// IT SENDS NOTHING ANYWHERE. It prints, and optionally writes a file the
// customer reads and then chooses to email. A support tool that phoned home
// would undermine exactly what the self-hosted tier is sold on.

import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { computePending, loadApplied } from './migrate-core.mjs'
import {
  buildBundle,
  bundleFindings,
  redactErrorLines,
  redactText,
} from '../lib/support/bundle-core.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? '')
}
const WANT_BUNDLE = args.includes('--bundle')
const LOG_FILE = flag('--logs')
const APP_URL = flag('--url')

// ---------- environment ----------
const env = { ...process.env }
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!env[k]) env[k] = v
  }
} catch { /* .env.local is optional — everything may be in the real environment */ }

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// ---------- database ----------
const database = {
  reachable: false,
  latencyMs: null,
  migrationsApplied: null,
  migrationsPending: null,
}
const counts = {}
const integrations = {
  supabase: env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'unconfigured',
  anthropic: env.ANTHROPIC_API_KEY ? 'configured' : 'unconfigured',
  stripe: env.STRIPE_SECRET_KEY ? 'configured' : 'unconfigured',
  resend: env.RESEND_API_KEY ? 'configured' : 'unconfigured',
  google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'configured' : 'unconfigured',
}

let files = []
try {
  files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
} catch {
  // Running from a built image rather than a checkout: the applied count is
  // still knowable, the pending list is not.
}

if (env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL })
  const started = Date.now()
  try {
    await client.connect()
    database.latencyMs = Date.now() - started
    database.reachable = true
    integrations.supabase = 'ok'

    const applied = await loadApplied(client)
    database.migrationsApplied = applied.length
    if (files.length) database.migrationsPending = computePending(files, applied)

    for (const table of ['tenants', 'itineraries', 'bookings', 'invoices', 'clients']) {
      try {
        // COUNTS, NEVER ROWS. Identifier interpolated from a literal list
        // above, never from input.
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`)
        counts[table] = rows[0].n
      } catch { /* a table this version does not have is not a finding */ }
    }
  } catch (err) {
    database.latencyMs = Date.now() - started
    database.error = err?.message || 'could not connect'
    integrations.supabase = 'failed'
  } finally {
    await client.end().catch(() => {})
  }
} else {
  database.error = 'DATABASE_URL is not set, so the database was not checked'
}

// ---------- a running app, if there is one ----------
const app = { version: pkg.version, sha: env.GIT_SHA || 'unknown', node: process.version }
if (APP_URL) {
  try {
    const res = await fetch(`${APP_URL.replace(/\/$/, '')}/api/version`)
    if (res.ok) {
      const body = await res.json()
      if (body?.sha) app.sha = body.sha
      if (body?.version) app.version = body.version
    }
  } catch {
    console.error(`Could not reach ${APP_URL}/api/version`)
  }
}

// ---------- logs the customer points us at ----------
let errors = []
if (LOG_FILE) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean)
    // Only lines that look like a problem — a whole log is neither readable
    // nor safe to widen the redaction surface over.
    errors = lines.filter(l => /error|exception|failed|✗|🛑|\b5\d\d\b/i.test(l))
  } catch (err) {
    console.error(`Could not read ${LOG_FILE}: ${redactText(err?.message)}`)
  }
}

const bundle = buildBundle({
  generatedAt: new Date().toISOString(),
  version: app.version,
  sha: app.sha,
  node: app.node,
  database,
  env,
  integrations,
  counts,
  errors,
})

// ---------- say it ----------
const tick = ok => (ok ? '✓' : '✗')
console.log(`\nAutoura doctor — ${bundle.generatedAt}\n`)
console.log(`  ${tick(true)} version              ${bundle.app.version}  (${bundle.app.sha})`)
console.log(`  ${tick(bundle.database.reachable)} database             ${
  bundle.database.reachable ? `reachable in ${bundle.database.latencyMs}ms` : bundle.database.error
}`)
// Three different states, and telling them apart is the point: pending is
// unknown because the database was not reached, or because this is a built
// image with no migration files, or it is a real number.
const pendingText =
  bundle.database.migrationsPending !== null
    ? `, ${bundle.database.migrationsPending.length} pending`
    : !database.reachable
      ? ' — not checked, the database was not reached'
      : `, pending unknown (no migration files in ${path.relative(ROOT, MIGRATIONS_DIR)})`
console.log(`  ${tick(bundle.database.migrationsPending?.length === 0)} migrations           ${
  bundle.database.migrationsApplied ?? '?'} applied${pendingText}`)
console.log(`  ${tick(bundle.env.missingRequired.length === 0)} required settings    ${
  bundle.env.missingRequired.length ? `missing ${bundle.env.missingRequired.join(', ')}` : 'all present'
}`)
console.log(`  ${tick(true)} optional settings    ${bundle.env.set.length} set, ${bundle.env.missing.length} unset`)
for (const [name, state] of Object.entries(bundle.integrations)) {
  console.log(`  ${tick(state !== 'failed')} ${name.padEnd(20)} ${state}`)
}

console.log('\nFindings:')
for (const finding of bundleFindings(bundle)) console.log(`  • ${finding}`)

if (errors.length) {
  console.log(`\nRecent problems from ${LOG_FILE} (scrubbed):`)
  for (const line of redactErrorLines(errors)) console.log(`  ${line}`)
}

if (WANT_BUNDLE) {
  const out = path.join(process.cwd(), 'support-bundle.json')
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2))
  console.log(`\nWrote ${out}`)
  console.log('  Read it before you send it. It contains:')
  for (const rule of bundle.redaction) console.log(`    - ${rule}`)
}

console.log('')
// Exit non-zero when something is actually wrong, so it can gate a deploy.
const broken =
  !bundle.database.reachable ||
  bundle.env.missingRequired.length > 0 ||
  (bundle.database.migrationsPending?.length ?? 0) > 0
process.exit(broken ? 1 : 0)
