import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RATE_MONETARY_COLUMNS } from '@/lib/rates/rate-currency'

// ============================================
// RATE_MONETARY_COLUMNS stays true to the live schema
// ============================================
// The fetch-boundary normalizer converts exactly the columns this map
// names. Its own header warns: "a new monetary column on any of these
// tables MUST be added here or it will silently stay unconverted" — a
// warning is a hope, this test is the enforcement. Three directions:
//
//   A. map → schema: every mapped column exists and is numeric. A renamed
//      or deleted column would otherwise sit in the map converting
//      NOTHING, which looks exactly like working.
//   B. schema → map: every numeric column on a mapped table whose name
//      says money (rate/price/cost/fee/tax/…) is either mapped or in the
//      closed exemption list with a reason.
//   C. table discovery: every table NAMED like a rate table
//      (*_rates/*_fees/*_costs) is mapped or exempted — a whole new rate
//      table must opt in to conversion, not drift past it.

const ROOT = path.resolve(__dirname, '../..')
const TYPES = readFileSync(path.join(ROOT, 'types', 'database.types.ts'), 'utf8')

// Numeric, money-named columns that are deliberately NOT converted.
// Closed list — every entry carries the reason it is not money.
const COLUMN_EXEMPT: Record<string, string> = {
  // (none today — the map currently covers every monetary column)
}

// Tables named like rate tables that are deliberately NOT in the map.
const TABLE_EXEMPT: Record<string, string> = {
  exchange_rates: 'the FX table itself — it IS the conversion source, its `rate` is a ratio, not an amount',
}

// A column name that talks about money. `rate_currency` never trips this:
// it is string-typed and the scan only looks at numeric columns.
const MONEY_NAME = /(rate|price|cost|fee|tax|suppl|reduction|amount|commission|margin|deposit|tip)/i

/** column → type text, for one table's Row block in the generated types. */
function rowColumns(table: string): Map<string, string> | null {
  const m = TYPES.match(
    new RegExp(`\\n      ${table}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`)
  )
  if (!m) return null
  const out = new Map<string, string>()
  for (const line of m[1].split('\n')) {
    const lm = line.match(/^\s+(\w+)\??: (.+)$/)
    if (lm) out.set(lm[1], lm[2])
  }
  return out
}

describe('RATE_MONETARY_COLUMNS ↔ live schema', () => {
  it('A: every mapped column exists on its table and is numeric — a dead entry converts nothing', () => {
    const violations: string[] = []
    for (const [table, columns] of Object.entries(RATE_MONETARY_COLUMNS)) {
      const schema = rowColumns(table)
      if (!schema) {
        violations.push(`${table}: table not found in types/database.types.ts`)
        continue
      }
      for (const col of columns) {
        const type = schema.get(col)
        if (!type) violations.push(`${table}.${col}: mapped but not in the schema (renamed or dropped?)`)
        else if (!type.includes('number'))
          violations.push(`${table}.${col}: mapped but ${type} — the normalizer only converts numbers`)
      }
    }
    expect(
      violations,
      'Stale entries in RATE_MONETARY_COLUMNS — they silently convert nothing:\n' + violations.join('\n')
    ).toEqual([])
  })

  it('B: every money-named numeric column on a mapped table is converted (or exempted with a reason)', () => {
    const violations: string[] = []
    for (const [table, columns] of Object.entries(RATE_MONETARY_COLUMNS)) {
      const schema = rowColumns(table)
      if (!schema) continue // direction A already reports this
      const mapped = new Set(columns)
      for (const [col, type] of schema) {
        if (!type.includes('number')) continue
        if (!MONEY_NAME.test(col)) continue
        if (mapped.has(col)) continue
        if (COLUMN_EXEMPT[`${table}.${col}`]) continue
        violations.push(`${table}.${col} (${type})`)
      }
    }
    expect(
      violations,
      'Monetary columns the normalizer does NOT convert — a foreign-currency row keeps these at raw\n' +
        'contract numbers. Add each to RATE_MONETARY_COLUMNS in lib/rates/rate-currency.ts, or to\n' +
        "COLUMN_EXEMPT here with the reason it is not money (a percentage, a ratio, a count):\n" +
        violations.join('\n')
    ).toEqual([])
  })

  it('C: every table named like a rate table is in the map or exempted', () => {
    const tables = [...TYPES.matchAll(/\n      ([a-z0-9_]+): \{\n        Row: \{/g)].map(m => m[1])
    const unmapped = tables.filter(
      t => /(_rates|_fees|_costs)$/.test(t) && !(t in RATE_MONETARY_COLUMNS) && !(t in TABLE_EXEMPT)
    )
    expect(
      unmapped,
      'New rate tables must opt in to fetch-boundary conversion (RATE_MONETARY_COLUMNS) or be\n' +
        'exempted here with a reason:\n' + unmapped.join('\n')
    ).toEqual([])
  })

  it('exemption lists do not go stale', () => {
    // A column exemption for a column that no longer exists, or a table
    // exemption for a vanished table, is dead weight that will one day
    // shadow a real finding.
    for (const key of Object.keys(COLUMN_EXEMPT)) {
      const [table, col] = key.split('.')
      const schema = rowColumns(table)
      expect(schema, `COLUMN_EXEMPT names missing table ${table}`).not.toBeNull()
      expect(schema!.has(col), `COLUMN_EXEMPT names missing column ${key}`).toBe(true)
    }
    for (const table of Object.keys(TABLE_EXEMPT)) {
      expect(rowColumns(table), `TABLE_EXEMPT names missing table ${table}`).not.toBeNull()
    }
    // And the scan itself must be looking at something real.
    expect(Object.keys(RATE_MONETARY_COLUMNS).length).toBeGreaterThanOrEqual(15)
  })
})
