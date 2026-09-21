// ============================================
// MIGRATION RUNNER — core logic
// ============================================
// The repo's convention was hand-applying supabase/migrations/*.sql in the
// Supabase SQL editor and recording each into schema_migrations (mig 233).
// That does not survive a second copy of the database. This runner makes the same contract
// executable: apply every unrecorded file in name order, record it, stop
// loudly on the first failure.
//
// This module is PURE-ish and client-agnostic — the CLI (migrate.mjs) wires
// a real pg client; the tests wire PGlite. A client is anything with
// `query(text) -> Promise<{ rows }>` (multi-statement text allowed; the
// migration files carry their own BEGIN/COMMIT).

/** Recorded names come in two historical spellings ('294_x' and '294_x.sql'). */
export function normalizeName(name) {
  return String(name).replace(/\.sql$/i, '')
}

/** Files not yet recorded, in name order (numeric prefixes sort correctly). */
export function computePending(fileNames, appliedNames) {
  const applied = new Set(appliedNames.map(normalizeName))
  return [...fileNames]
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => !applied.has(normalizeName(f)))
}

/** Matches migration 233 exactly, so adopting the runner needs no migration. */
export const TRACKER_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

/**
 * The recorded migration names.
 *
 * `create: false` is for ASKING about a database — `--status`, `--dry-run` —
 * which must not write to it: returns null when there is no tracker at all.
 * Those two used to run TRACKER_BOOTSTRAP like everything else, so "what state
 * is this in?" created a table in whatever database it was pointed at.
 */
export async function loadApplied(client, { create = true } = {}) {
  if (create) {
    await client.query(TRACKER_BOOTSTRAP)
  } else {
    const { rows } = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present")
    if (!rows[0]?.present) return null
  }
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name')
  return rows.map(r => r.name)
}

// ---------------------------------------------------------------------------
// WHICH DATABASE IS THIS?
// ---------------------------------------------------------------------------
// This repo has a sibling product, travel-ops-pro, with its own Supabase
// project — and the two have met the wrong way round in BOTH directions:
//
//   2026-08-28  a migration meant for this app was pasted into the sibling's
//               project. It failed and rolled back: luck, not design.
//   2026-09-21  regenerating types here turned up `bookings.status_override`,
//               a column no migration in this repo creates. It is the sibling's
//               `20261022_booking_status_override.sql`, applied to THIS
//               database at some point. Valid against both schemas, so it
//               went in silently.
//
// The sibling's runner has refused the wrong database since the first of
// those. This is the mirror image. It matters more than it looks: both apps
// call their tracker `schema_migrations`, so this runner pointed at the
// sibling's database would find a tracker, read every one of this repo's
// files as pending, and start applying them from 001.
//
// The two schemas are distinguishable: this app has `tenants`, the sibling has
// `organizations` — checked against both live databases on 2026-09-21.
export async function identifyDatabase(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.tenants')       IS NOT NULL AS has_tenants,
      to_regclass('public.organizations') IS NOT NULL AS has_organizations
  `)
  const { has_tenants: tenants, has_organizations: org } = rows[0] ?? {}
  if (org && !tenants) return { verdict: 'sibling', detail: 'has `organizations`, no `tenants` — this looks like travel-ops-pro' }
  if (tenants) return { verdict: 'ours', detail: 'has `tenants`' }
  return { verdict: 'empty', detail: 'neither `tenants` nor `organizations` — an empty or brand-new database' }
}

/**
 * Should this run be allowed to touch this database?
 *
 * Pure, so the refusals are tested rather than only asserted in the CLI.
 *
 * @returns { ok: true } | { ok: false, reason: string }
 */
export function checkTarget(identity, { baseline = false } = {}) {
  if (identity.verdict === 'sibling') {
    return {
      ok: false,
      reason:
        'REFUSING: this looks like travel-ops-pro, not autoura-saas.\n' +
        'These are different products with different schemas. A migration from\n' +
        'this repo does not belong here. Check DATABASE_URL.',
    }
  }
  if (baseline && identity.verdict === 'empty') {
    return {
      ok: false,
      reason:
        'REFUSING to --baseline an empty database.\n' +
        '--baseline records every migration as applied WITHOUT running it. On an\n' +
        'empty database that produces a tracker claiming a schema that is not\n' +
        'there, and no later run will ever build it. Run without --baseline.',
    }
  }
  return { ok: true }
}

/**
 * Apply (or in baseline mode, merely record) every pending migration.
 *
 * @param client   { query(text, params?) }
 * @param files    Array<{ name: string, sql: string }> — ALL repo migrations
 * @param options  { dryRun?, baseline?, log? }
 * @returns { applied: string[], pending: string[], identity, failed?: { name, error }, refused?: string }
 */
export async function runPending(client, files, options = {}) {
  const { dryRun = false, baseline = false, log = () => {} } = options

  // The guard lives HERE, not in the CLI, so nothing that runs migrations can
  // skip it — and it runs before the tracker is touched, so a refused run has
  // written nothing at all. A dry run is refused too: "261 pending" against the
  // wrong database is not information, it is an invitation.
  const identity = await identifyDatabase(client)
  const target = checkTarget(identity, { baseline })
  if (!target.ok) return { applied: [], pending: [], identity, refused: target.reason }

  // Asking is read-only; only a real run may create the tracker.
  const appliedNames = (await loadApplied(client, { create: !dryRun })) ?? []
  const byName = new Map(files.map(f => [f.name, f]))
  const pending = computePending(files.map(f => f.name), appliedNames)

  if (dryRun) return { applied: [], pending, identity }

  const applied = []
  for (const name of pending) {
    const file = byName.get(name)
    if (baseline) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [normalizeName(name)])
      applied.push(name)
      log(`baseline  ${name}`)
      continue
    }
    try {
      await client.query(file.sql)
    } catch (error) {
      // Stop HERE: later migrations assume this one's schema. Nothing is
      // recorded for the failed file, so a rerun retries it.
      return { applied, pending: pending.slice(applied.length), identity, failed: { name, error } }
    }
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [normalizeName(name)])
    applied.push(name)
    log(`applied   ${name}`)
  }
  return { applied, pending: [], identity }
}
