import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { normalizeName, computePending, runPending, loadApplied } from '../migrate-core.mjs'

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

describe('runPending against real Postgres', () => {
  let db: PGlite
  beforeEach(() => { db = new PGlite() })

  // 30s: PGlite start-up competes with the (real, growing) migration replay
  // in the same suite run — under full-suite load this crossed the 5s default.
  it('applies in order, records each, and a rerun is a no-op', { timeout: 30_000 }, async () => {
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
    const result = await runPending(client, FILES, { baseline: true })
    expect(result.applied).toEqual(FILES.map(f => f.name))
    expect(await loadApplied(client)).toEqual(['001_first', '002_second', '003_third'])
    const tables = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 't1'")
    expect((tables.rows[0] as { n: number }).n).toBe(0)
  })

  it('dry-run reports pending and touches nothing', async () => {
    const client = pgliteClient(db)
    const result = await runPending(client, FILES, { dryRun: true })
    expect(result.pending).toEqual(FILES.map(f => f.name))
    expect(await loadApplied(client)).toEqual([])
  })
})
