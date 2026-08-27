// ============================================
// MIGRATION RUNNER — core logic (self-hosted deliverable, plan §5)
// ============================================
// The repo's convention was hand-applying supabase/migrations/*.sql in the
// Supabase SQL editor and recording each into schema_migrations (mig 233).
// That does not survive self-hosting. This runner makes the same contract
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

export async function loadApplied(client) {
  await client.query(TRACKER_BOOTSTRAP)
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name')
  return rows.map(r => r.name)
}

/**
 * Apply (or in baseline mode, merely record) every pending migration.
 *
 * @param client   { query(text, params?) }
 * @param files    Array<{ name: string, sql: string }> — ALL repo migrations
 * @param options  { dryRun?, baseline?, log? }
 * @returns { applied: string[], pending: string[], failed?: { name, error } }
 */
export async function runPending(client, files, options = {}) {
  const { dryRun = false, baseline = false, log = () => {} } = options
  const appliedNames = await loadApplied(client)
  const byName = new Map(files.map(f => [f.name, f]))
  const pending = computePending(files.map(f => f.name), appliedNames)

  if (dryRun) return { applied: [], pending }

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
      return { applied, pending: pending.slice(applied.length), failed: { name, error } }
    }
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [normalizeName(name)])
    applied.push(name)
    log(`applied   ${name}`)
  }
  return { applied, pending: [] }
}
