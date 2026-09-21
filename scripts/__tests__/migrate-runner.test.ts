import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { normalizeName, computePending, runPending, loadApplied, identifyDatabase, checkTarget } from '../migrate-core.mjs'

// The migration runner, driven end-to-end against a
// real Postgres (PGlite). The contract: apply unrecorded files in order,
// record each, stop LOUDLY on the first failure without recording it, and
// tolerate the two historical name spellings in schema_migrations.

// pg.Client's query(text) uses the simple protocol (multi-statement OK);
// PGlite's query() prepares (single statement only) — exec() is its
// multi-statement path. The adapter routes accordingly.
function pgliteClient(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      if (params && params.length > 0) {
        const res = await db.query(text, params as never)
        return { rows: res.rows as Array<Record<string, unknown>> }
      }
      const results = await db.exec(text)
      const last = results[results.length - 1]
      return { rows: ((last?.rows ?? []) as Array<Record<string, unknown>>) }
    },
  }
}

const FILES = [
  { name: '001_first.sql', sql: 'BEGIN;\nCREATE TABLE t1 (id INT);\nCOMMIT;' },
  { name: '002_second.sql', sql: 'BEGIN;\nALTER TABLE t1 ADD COLUMN v TEXT;\nCOMMIT;' },
  { name: '003_third.sql', sql: "BEGIN;\nINSERT INTO t1 (id, v) VALUES (1, 'x');\nCOMMIT;" },
]

describe('normalizeName / computePending', () => {
  it('treats bare and .sql-suffixed recorded names as the same migration', () => {
    expect(normalizeName('294_destination_catalog.sql')).toBe('294_destination_catalog')
    const pending = computePending(
      ['001_a.sql', '002_b.sql', '003_c.sql'],
      ['001_a', '002_b.sql']
    )
    expect(pending).toEqual(['003_c.sql'])
  })

  it('sorts by name and ignores non-sql files', () => {
    expect(computePending(['010_z.sql', '002_a.sql', 'README.md'], [])).toEqual(['002_a.sql', '010_z.sql'])
  })
})

// Every test here boots a fresh PGlite, which competes with the (real,
// growing) full-migration replay in the same suite run — under load any of
// them can cross the 5s default. One describe-level allowance.
describe('runPending against real Postgres', { timeout: 30_000 }, () => {
  let db: PGlite
  beforeEach(() => { db = new PGlite() })

  it('applies in order, records each, and a rerun is a no-op', async () => {
    const client = pgliteClient(db)
    const first = await runPending(client, FILES)
    expect(first.failed).toBeUndefined()
    expect(first.applied).toEqual(FILES.map(f => f.name))

    const { rows } = await db.query('SELECT v FROM t1')
    expect(rows).toEqual([{ v: 'x' }])
    expect(await loadApplied(client)).toEqual(['001_first', '002_second', '003_third'])

    const again = await runPending(client, FILES)
    expect(again.applied).toEqual([])
  })

  it('stops at the first failure and does NOT record the failed file', async () => {
    const client = pgliteClient(db)
    const broken = [
      FILES[0],
      { name: '002_broken.sql', sql: 'BEGIN;\nALTER TABLE nope ADD COLUMN x INT;\nCOMMIT;' },
      FILES[2],
    ]
    const result = await runPending(client, broken)
    expect(result.applied).toEqual(['001_first.sql'])
    expect(result.failed?.name).toBe('002_broken.sql')
    // rollback any aborted tx state before further queries
    await db.query('ROLLBACK').catch(() => undefined)
    expect(await loadApplied(client)).toEqual(['001_first'])
    // third file must not have run
    const t1 = await db.query('SELECT count(*)::int AS n FROM t1')
    expect((t1.rows[0] as { n: number }).n).toBe(0)
  })

  it('baseline mode records everything without executing any SQL', async () => {
    const client = pgliteClient(db)
    // What --baseline is FOR: adopting the runner on a database that already
    // has this app's schema. (On an EMPTY one it is refused — see below.)
    await db.exec('CREATE TABLE tenants (id INT)')
    const result = await runPending(client, FILES, { baseline: true })
    expect(result.applied).toEqual(FILES.map(f => f.name))
    expect(await loadApplied(client)).toEqual(['001_first', '002_second', '003_third'])
    const tables = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 't1'")
    expect((tables.rows[0] as { n: number }).n).toBe(0)
  })

  it('dry-run reports pending and touches NOTHING — not even the tracker', async () => {
    const client = pgliteClient(db)
    const result = await runPending(client, FILES, { dryRun: true })
    expect(result.pending).toEqual(FILES.map(f => f.name))
    // It used to run TRACKER_BOOTSTRAP like a real run, so asking "what would
    // this do?" created a table in whatever database it was pointed at.
    expect(await loadApplied(client, { create: false })).toBeNull()
  })
})

// ============================================================================
// WHICH DATABASE IS THIS?
//
// This repo has a sibling product, travel-ops-pro, with its own Supabase
// project — and the two have met the wrong way round in BOTH directions. On
// 2026-09-21, regenerating types here turned up `bookings.status_override`: a
// column no migration in this repo creates, from the sibling's
// `20261022_booking_status_override.sql`, applied to this database at some
// point. It was valid against both schemas, so it went in silently.
//
// Both apps call their tracker `schema_migrations`. Pointed at the sibling's
// database, this runner would find a tracker, read every file in this repo as
// pending, and start applying them from 001.
// ============================================================================
// ONE Postgres for these, wiped between tests. A fresh PGlite per test is a
// WebAssembly cold start each time; a dozen of them at once, beside the rest of
// the suite, pushed unrelated tests past their timeouts.
const shared = new PGlite()
const wipe = () => shared.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')

describe('the runner knows which database it is pointed at', { timeout: 60_000 }, () => {
  const db = shared
  beforeEach(wipe)

  const asOurs = () => db.exec('CREATE TABLE tenants (id INT)')
  const asSibling = () => db.exec('CREATE TABLE organizations (id INT); CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); INSERT INTO schema_migrations (name) VALUES (\'20261029_supplier_code_sequence\')')

  it('tells the three apart — checked against both live databases', async () => {
    expect((await identifyDatabase(pgliteClient(db))).verdict).toBe('empty')
    await asOurs()
    expect(await identifyDatabase(pgliteClient(db))).toEqual({ verdict: 'ours', detail: 'has `tenants`' })
    await wipe()
    await db.exec('CREATE TABLE organizations (id INT)')
    const id = await identifyDatabase(pgliteClient(db))
    expect(id.verdict).toBe('sibling')
    expect(id.detail).toMatch(/travel-ops-pro/)
  })

  it('a database with BOTH tables is ours — only `organizations` with no `tenants` is the sibling', async () => {
    await db.exec('CREATE TABLE tenants (id INT); CREATE TABLE organizations (id INT)')
    expect((await identifyDatabase(pgliteClient(db))).verdict).toBe('ours')
  })

  it('REFUSES the sibling\'s database, and says to check DATABASE_URL', async () => {
    await asSibling()
    const result = await runPending(pgliteClient(db), FILES)
    expect(result.refused).toMatch(/this looks like travel-ops-pro, not autoura-saas/)
    expect(result.refused).toMatch(/Check DATABASE_URL/)
    expect(result.applied).toEqual([])
  })

  it('…having written NOTHING there: no table, and the sibling\'s tracker untouched', async () => {
    await asSibling()
    await runPending(pgliteClient(db), FILES)
    const t1 = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 't1'")
    expect((t1.rows[0] as { n: number }).n, 'no migration ran').toBe(0)
    const recorded = await db.query('SELECT name FROM schema_migrations ORDER BY name')
    expect((recorded.rows as Array<{ name: string }>).map(r => r.name), 'their ledger is exactly as it was').toEqual(['20261029_supplier_code_sequence'])
  })

  it('refuses a DRY RUN there too — "3 pending" against the wrong database is an invitation, not information', async () => {
    await asSibling()
    const result = await runPending(pgliteClient(db), FILES, { dryRun: true })
    expect(result.refused).toBeDefined()
    expect(result.pending).toEqual([])
  })

  it('refuses --baseline there as well — it would stamp 261 of our names into their ledger', async () => {
    await asSibling()
    const result = await runPending(pgliteClient(db), FILES, { baseline: true })
    expect(result.refused).toBeDefined()
    const recorded = await db.query('SELECT count(*)::int AS n FROM schema_migrations')
    expect((recorded.rows[0] as { n: number }).n).toBe(1)
  })

  it('refuses --baseline on an EMPTY database — a ledger claiming a schema that is not there', async () => {
    const result = await runPending(pgliteClient(db), FILES, { baseline: true })
    expect(result.refused).toMatch(/REFUSING to --baseline an empty database/)
    expect(await loadApplied(pgliteClient(db), { create: false })).toBeNull()
  })

  it('an empty database may still be BUILT — that is a fresh install', async () => {
    const result = await runPending(pgliteClient(db), FILES)
    expect(result.refused).toBeUndefined()
    expect(result.applied).toEqual(FILES.map(f => f.name))
    expect(result.identity.verdict).toBe('empty')
  })

  it('our own database runs as it always did, and reports what it is', async () => {
    await asOurs()
    const result = await runPending(pgliteClient(db), FILES)
    expect(result.refused).toBeUndefined()
    expect(result.applied).toEqual(FILES.map(f => f.name))
    expect(result.identity).toEqual({ verdict: 'ours', detail: 'has `tenants`' })
  })

  it('the refusals are a pure rule, not something only the CLI knows', () => {
    expect(checkTarget({ verdict: 'ours', detail: '' })).toEqual({ ok: true })
    expect(checkTarget({ verdict: 'empty', detail: '' })).toEqual({ ok: true })
    expect(checkTarget({ verdict: 'empty', detail: '' }, { baseline: true }).ok).toBe(false)
    expect(checkTarget({ verdict: 'sibling', detail: '' }).ok).toBe(false)
    expect(checkTarget({ verdict: 'sibling', detail: '' }, { baseline: true }).ok).toBe(false)
  })
})

describe('asking about a database does not write to it', { timeout: 60_000 }, () => {
  const db = shared
  beforeEach(wipe)

  it('loadApplied({ create: false }) is null when there is no tracker, and creates none', async () => {
    expect(await loadApplied(pgliteClient(db), { create: false })).toBeNull()
    const t = await db.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present")
    expect((t.rows[0] as { present: boolean }).present).toBe(false)
  })

  it('and reads it when there is one', async () => {
    await loadApplied(pgliteClient(db))                      // a real run creates it
    expect(await loadApplied(pgliteClient(db), { create: false })).toEqual([])
  })

  it('the CLI\'s --status uses the read-only form, and never prints the credentials', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cli = readFileSync(join(process.cwd(), 'scripts/migrate.mjs'), 'utf8')
    expect(cli).toMatch(/loadApplied\(client, \{ create: false \}\)/)
    expect(cli).toMatch(/Target: \$\{redactUrl\(url\)\}/)
    // redactUrl builds its line from hostname, port and path only.
    const redact = cli.slice(cli.indexOf('function redactUrl'), cli.indexOf('async function main'))
    expect(redact).not.toMatch(/password|username|u\.href|toString\(\)/)
  })
})
