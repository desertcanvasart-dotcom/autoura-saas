#!/usr/bin/env node
// ============================================
// MIGRATION RUNNER — CLI
// ============================================
// Usage (DATABASE_URL = the Postgres connection string of your Supabase
// project — Dashboard → Settings → Database → Connection string):
//
//   DATABASE_URL=postgres://... node scripts/migrate.mjs             # apply pending
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --status    # list state
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --dry-run   # show pending
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --baseline  # record ALL
//                              # files as applied WITHOUT running them — for a
//                              # database whose schema already matches the repo
//                              # (adopting the runner on an existing install)
//
// Files apply in name order; each carries its own BEGIN/COMMIT; the first
// failure stops the run and is NOT recorded, so a rerun retries it.
//
// EVERY mode says where it is pointed — host, port and database, never the
// credentials — and what it found there. And it REFUSES the sibling product's
// database (travel-ops-pro: `organizations`, no `tenants`) in every mode,
// including --dry-run, before touching anything: both apps call their tracker
// `schema_migrations`, so this runner would otherwise read all of this repo's
// files as pending there and start from 001. It also refuses --baseline on an
// empty database. --status and --dry-run are read-only; they do not create the
// tracker. See identifyDatabase / checkTarget in migrate-core.mjs.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { computePending, identifyDatabase, loadApplied, runPending } from './migrate-core.mjs'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

/** Where this is pointed — host, port and database, never the credentials. */
function redactUrl(url) {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required (your Supabase project\'s Postgres connection string).')
    process.exit(2)
  }

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  try {
    const fileNames = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()

    if (args.has('--status')) {
      // Read-only: asking "what state is this in?" must not create the tracker.
      const id = await identifyDatabase(client)
      console.log(`${redactUrl(url)} — ${id.detail}`)
      if (id.verdict === 'sibling') {
        console.error('\nThis is NOT autoura-saas\'s database. Its schema_migrations table belongs to travel-ops-pro,')
        console.error('so "pending" here would mean nothing. Check DATABASE_URL.')
        process.exitCode = 1
        return
      }
      const applied = await loadApplied(client, { create: false })
      if (applied === null) {
        console.log('No schema_migrations table — nothing has ever been recorded here.')
        console.log(`${fileNames.length} migration file(s) in the repo, none recorded.`)
        return
      }
      const pending = computePending(fileNames, applied)
      console.log(`${applied.length} recorded, ${pending.length} pending`)
      for (const p of pending) console.log(`  pending  ${p}`)
      return
    }

    const files = fileNames.map(name => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'),
    }))

    const result = await runPending(client, files, {
      dryRun: args.has('--dry-run'),
      baseline: args.has('--baseline'),
      log: line => console.log(line),
    })

    // Say where this went, every time — the one line that would have caught
    // both wrong-database incidents before anything ran.
    console.log(`Target: ${redactUrl(url)} — ${result.identity.detail}`)
    if (result.refused) {
      console.error(`\n${result.refused}`)
      process.exitCode = 1
      return
    }

    if (args.has('--dry-run')) {
      console.log(`${result.pending.length} pending`)
      for (const p of result.pending) console.log(`  would apply  ${p}`)
      return
    }
    if (result.failed) {
      console.error(`\nFAILED at ${result.failed.name}:`)
      console.error(result.failed.error.message ?? result.failed.error)
      console.error(`\n${result.applied.length} applied before the failure; the failed file was NOT recorded — fix and rerun.`)
      process.exit(1)
    }
    console.log(result.applied.length === 0 ? 'Nothing to do — up to date.' : `Done: ${result.applied.length} migration(s).`)
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
