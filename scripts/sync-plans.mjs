#!/usr/bin/env node
/**
 * Apply the generated plan catalogue to `subscription_plans` on every boot.
 *
 * WHY
 * ---
 * Plan limits lived in three places that disagreed, and enforcement
 * (`check_usage_limit`) read the database — so `lib/pricing-config.ts` was
 * decorative. This makes the config canonical: the database is re-derived from
 * the committed artifact each deploy, so a row edited directly in production
 * is overwritten rather than silently becoming the real policy.
 *
 * The artifact (supabase/generated/plans.json) exists because this script is
 * plain Node and cannot import TypeScript. It is generated and drift-gated by
 * lib/__tests__/plans-sync.test.ts, which fails the build if pricing-config.ts
 * changed without regeneration.
 *
 * NON-FATAL BY DESIGN
 * -------------------
 * Wired into `start` as `node scripts/sync-plans.mjs && next start`, so it runs
 * before the web server accepts traffic. It therefore ALWAYS exits 0: a
 * transient database blip must never stop the site booting. Failures are
 * logged loudly and the previous catalogue simply remains in place.
 *
 * `--check` inverts that for local/CI use: report drift and exit 1 without
 * writing anything.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT = path.join(ROOT, 'supabase/generated/plans.json')
const CHECK_ONLY = process.argv.includes('--check')

/** Non-fatal: log and leave the existing catalogue alone. */
function giveUp(reason) {
  console.warn(`sync-plans: skipped — ${reason}`)
  process.exit(CHECK_ONLY ? 1 : 0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  giveUp('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
}

let rows
try {
  rows = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'))
} catch (err) {
  giveUp(`cannot read ${path.relative(ROOT, ARTIFACT)}: ${err.message}`)
}

if (!Array.isArray(rows) || rows.length === 0) {
  giveUp('artifact is empty — refusing to wipe the plan catalogue')
}

try {
  // Inside the try: `start` chains this with `&& next start`, so ANY escaping
  // throw would stop the site booting. Client construction included.
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: existing, error: readError } = await supabase
    .from('subscription_plans')
    .select('slug, name, price_monthly, price_yearly, max_team_members, max_quotes_per_month, max_itinerary_runs_per_month')

  if (readError) giveUp(`cannot read subscription_plans: ${readError.message}`)

  const bySlug = new Map((existing || []).map(r => [r.slug, r]))
  const drifted = []
  for (const row of rows) {
    const current = bySlug.get(row.slug)
    if (!current) {
      drifted.push(`${row.slug}: missing`)
      continue
    }
    for (const key of Object.keys(row)) {
      if (!(key in current)) continue
      // Numeric columns come back as strings from DECIMAL — compare loosely.
      const a = current[key]
      const b = row[key]
      const same = a === b || (a !== null && b !== null && Number(a) === Number(b))
      if (!same) drifted.push(`${row.slug}.${key}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`)
    }
  }

  if (CHECK_ONLY) {
    if (drifted.length === 0) {
      console.log(`sync-plans: in sync — ${rows.length} plan(s) match the artifact`)
      process.exit(0)
    }
    console.error(`sync-plans: DRIFT (${drifted.length})`)
    for (const d of drifted) console.error(`   ${d}`)
    process.exit(1)
  }

  if (drifted.length === 0) {
    console.log(`sync-plans: no changes — ${rows.length} plan(s) already match`)
    process.exit(0)
  }

  // slug is UNIQUE — the conflict target.
  const { error: writeError } = await supabase
    .from('subscription_plans')
    .upsert(rows, { onConflict: 'slug' })

  if (writeError) giveUp(`upsert failed: ${writeError.message}`)

  console.log(`sync-plans: applied ${rows.length} plan(s); ${drifted.length} field(s) updated`)
  for (const d of drifted) console.log(`   ${d}`)
  process.exit(0)
} catch (err) {
  giveUp(`unexpected error: ${err?.message || err}`)
}
