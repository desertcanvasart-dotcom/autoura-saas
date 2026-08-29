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

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { computePending, loadApplied, runPending } from './migrate-core.mjs'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

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
      const applied = await loadApplied(client)
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
