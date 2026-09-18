import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

// ============================================
// The rate sheets and the tables must not drift FURTHER
// ============================================
// A CSV round trip has to be lossless: export → delete → re-import must give
// back the same rate. It has failed twice — the property link (migration 312's
// supplier_id, which the form wrote and the sheet never spelled) and the
// supplier code — and both times the loss was invisible until somebody
// re-imported a file and found a rate stripped of what made it findable.
//
// Two checks, against the GENERATED types (which come from the live schema):
//
//   1. EXACT: every column the sheet names exists on the table, except the
//      natural keys below, which exist so a LINK can travel between installs.
//      A typo or a renamed column fails here.
//
//   2. RATCHET: the columns a table has and its sheet does not are recorded in
//      scripts/rates-csv-dropped-baseline.json. The test fails when that set
//      GROWS — a migration that adds a rate column must decide whether the
//      sheet carries it.
//
// A ratchet rather than an allowlist, deliberately. Most of what is in the
// baseline today is dead weight from the old season-column model (the periods
// now travel in their own sheet, lib/rates/periods-csv.ts), and claiming they
// are all fine would be a lie told in a test. What is true is that they are
// known, and that nothing new should join them.

const ROOT = path.join(__dirname, '..', '..')
const TYPES = readFileSync(path.join(ROOT, 'types', 'database.types.ts'), 'utf8')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'rates-csv-dropped-baseline.json')

/** Sheet columns that are natural keys, not table columns: a link travels by
 *  name because an id means nothing in another install. */
const NATURAL_KEYS: Record<string, string> = {
  supplier_code: 'the supplier travels by its code, never by a local supplier_id',
  property_name: 'train sheets name the property; supplier_properties resolves it (migration 311)',
}

/** Columns every table has that no sheet should carry. */
const NEVER_IN_A_SHEET = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at',
  'property_id', 'supplier_id', 'destination_id', 'rate_id', 'is_preferred', 'search_vector', 'embedding',
])

function rowColumns(table: string): Set<string> | null {
  const m = TYPES.match(new RegExp(`\\n      ${table}: \\{\\n        Row: \\{([\\s\\S]*?)\\n        \\}`))
  if (!m) return null
  return new Set([...m[1].matchAll(/^\s+([a-z0-9_]+)[?]?:/gim)].map(x => x[1]))
}

const sheetColumns = (config: (typeof RATE_TABLE_CONFIGS)[string]) =>
  new Set(config.columns.map(c => (c as { name: string }).name))

const baseline: Record<string, string[]> = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

describe('every rate sheet against its table', () => {
  const configs = Object.values(RATE_TABLE_CONFIGS)

  it('covers the rate tables the app imports', () => {
    expect(configs.length).toBeGreaterThanOrEqual(15)
  })

  for (const config of configs) {
    describe(config.tableName, () => {
      it('names only real columns, or a natural key', () => {
        const columns = rowColumns(config.tableName)
        expect(columns, `${config.tableName} is missing from the generated types`).not.toBeNull()
        const phantom = [...sheetColumns(config)].filter(c => !columns!.has(c) && !(c in NATURAL_KEYS))
        expect(phantom, `${config.tableName}: the sheet names columns the table does not have`).toEqual([])
      })

      it('drops nothing new', () => {
        const columns = rowColumns(config.tableName)
        if (!columns) return
        const sheet = sheetColumns(config)
        const dropped = [...columns].filter(c => !sheet.has(c) && !NEVER_IN_A_SHEET.has(c)).sort()
        const known = new Set(baseline[config.tableName] ?? [])
        const added = dropped.filter(c => !known.has(c))
        expect(
          added,
          `${config.tableName}: these columns are new and the sheet does not carry them, so an ` +
            'export → re-import loses them. Add them to the sheet, or — if they genuinely do not ' +
            'belong in it — to scripts/rates-csv-dropped-baseline.json with the PR that adds them:\n  ' +
            added.join('\n  ')
        ).toEqual([])
      })
    })
  }
})

describe('the baseline', () => {
  it('does not go stale: every entry is still a column the sheet still omits', () => {
    const stale: string[] = []
    for (const [table, columns] of Object.entries(baseline)) {
      const real = rowColumns(table)
      if (!real) { stale.push(`${table} (table gone)`); continue }
      const sheet = sheetColumns(RATE_TABLE_CONFIGS[table] ? RATE_TABLE_CONFIGS[table] : { columns: [] } as never)
      for (const c of columns) {
        if (!real.has(c)) stale.push(`${table}.${c} (column gone)`)
        else if (sheet.has(c)) stale.push(`${table}.${c} (now carried — remove it from the baseline)`)
      }
    }
    expect(stale, 'the baseline has drifted from the schema:\n  ' + stale.join('\n  ')).toEqual([])
  })

  it('every natural key has a reason', () => {
    for (const [key, reason] of Object.entries(NATURAL_KEYS)) {
      expect(reason.length, key).toBeGreaterThan(20)
    }
  })
})

// Regenerating the baseline deliberately: `RATES_CSV_BASELINE=update npx vitest
// run lib/__tests__/rates-csv-schema-guard.test.ts`. It is not automatic — a
// column quietly joining the baseline is the drift this test exists to catch.
if (process.env.RATES_CSV_BASELINE === 'update') {
  describe('baseline update', () => {
    it('writes the current state', () => {
      const next: Record<string, string[]> = {}
      for (const config of Object.values(RATE_TABLE_CONFIGS)) {
        const columns = rowColumns(config.tableName)
        if (!columns) continue
        const sheet = sheetColumns(config)
        const dropped = [...columns].filter(c => !sheet.has(c) && !NEVER_IN_A_SHEET.has(c)).sort()
        if (dropped.length) next[config.tableName] = dropped
      }
      writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
      expect(Object.keys(next).length).toBeGreaterThan(0)
    })
  })
}
