#!/usr/bin/env node
// ============================================
// WIPE TEST DATA — operational rows only, every tenant
// ============================================
// Authorised by the operator on 2026-09-06 ("we can remove the data entirely
// as we are in testing phase") for the tenant-vocabulary rollout: rate rows
// were written under the old fixed words and store labels where the app now
// stores keys. Tenants, members, suppliers, clients, settings, vocabularies
// and the destination catalog are NOT touched — only what an agency enters
// as rates, tours, quotes and content, which each agency re-enters in its
// own words.
//
//   DATABASE_URL=postgres://... node scripts/wipe-test-data.mjs --dry-run   # counts only
//   DATABASE_URL=postgres://... node scripts/wipe-test-data.mjs --yes       # delete
//
// Deletes run in ONE transaction, in dependency order; a foreign key this
// list forgot aborts the whole run rather than leaving half a wipe.

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const TABLES = [
  // tours & itineraries (children cascade from their parents)
  'tour_departures',
  'tour_variations',
  'tour_templates',
  'itineraries',
  // quotes
  'b2b_quotes',
  'b2c_quotes',
  // content library
  'content_variations',
  'content_library',
  'content_items',
  // rates
  'accommodation_rates',
  'nile_cruises',
  'entrance_fees',
  'flight_rates',
  'train_rates',
  'sleeping_train_rates',
  'transportation_rates',
  'guide_rates',
  'meal_rates',
  'tipping_rates',
  'airport_staff_rates',
  'hotel_staff_rates',
  'activity_rates',
  'extras_catalogue',
  'fixed_daily_costs',
  'rate_seasons',
  'rate_audit_log',
]

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = !args.has('--yes')
  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL is required'); process.exit(2) }
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)', ['public', TABLES])
    const present = new Set(rows.map(r => r.table_name))
    const targets = TABLES.filter(t => present.has(t))
    const skipped = TABLES.filter(t => !present.has(t))
    if (skipped.length) console.log(`(not in this database, skipped: ${skipped.join(', ')})`)

    await client.query('BEGIN')
    let total = 0
    for (const t of targets) {
      const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM ${t}`)
      if (n === 0) continue
      if (dryRun) { console.log(`would delete ${String(n).padStart(6)}  ${t}`); total += n; continue }
      const res = await client.query(`DELETE FROM ${t}`)
      console.log(`deleted      ${String(res.rowCount).padStart(6)}  ${t}`)
      total += res.rowCount
    }
    if (dryRun) { await client.query('ROLLBACK'); console.log(`\nDry run: ${total} rows across ${targets.length} tables. Re-run with --yes to delete.`) }
    else { await client.query('COMMIT'); console.log(`\nDone: ${total} rows deleted.`) }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Aborted, nothing deleted:', e.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}
main()
