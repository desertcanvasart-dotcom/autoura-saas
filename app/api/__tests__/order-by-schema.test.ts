import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Every .order() column must exist on the table it sorts
// ============================================
// PostgREST rejects the WHOLE query when an ORDER BY names a column the
// table doesn't have — and test mocks happily sort anything, so CI stays
// green while production returns nothing. Two live instances were found in
// this repo (template analytics ordering by a nonexistent created_at;
// WhatsApp auto-assign ordering by last_assigned_at, which migration 309
// deliberately never added), and the sibling repo lost a day of hotel
// pricing to the same class. This scan checks every `.order('col')` against
// the generated schema types.
//
// Heuristic: for each `.from('table')`, the window until the next `.from(`
// belongs to that table's query chain (covers `const q = supabase.from(...)`
// … `await q.order(...)` too). A false positive goes in the exemption list
// WITH ITS REASON — never silence a finding you have not verified.

const ROOT = path.join(__dirname, '..', '..', '..')
const TYPES = readFileSync(path.join(ROOT, 'types', 'database.types.ts'), 'utf8')

// Verified false positives of the window heuristic, or intentional shapes.
const EXEMPT: Array<{ file: string; table: string; column: string; reason: string }> = [
  {
    file: 'app/api/conversations/route.ts',
    table: 'trip_messages',
    column: 'last_message_at',
    reason:
      "the .order belongs to the `query` variable built from unified_conversations (which HAS last_message_at, mig 125); an intervening .from('trip_messages') id-lookup steals the window",
  },
]

function rowColumns(table: string): Set<string> | null {
  // Tables and Views both carry a Row block.
  const m = TYPES.match(new RegExp(`\\n      ${table}: \\{\\n        Row: \\{([\\s\\S]*?)\\n        \\}`))
  if (!m) return null
  return new Set([...m[1].matchAll(/^\s+([a-z0-9_]+)[?]?:/gim)].map(x => x[1]))
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* sourceFiles(full)
    else if (/\.tsx?$/.test(entry) && !full.includes('__tests__')) yield full
  }
}

describe('.order() columns exist on their tables', () => {
  it('finds no phantom order columns in app/ or lib/', () => {
    const violations: string[] = []

    for (const dir of ['app', 'lib']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        const rel = path.relative(ROOT, file)

        const fromMatches = [...src.matchAll(/\.from\(\s*'([a-z0-9_]+)'\s*\)/g)]
        fromMatches.forEach((fm, i) => {
          const table = fm[1]
          const columns = rowColumns(table)
          if (!columns) return // not a public table/view (storage, rpc, dynamic)

          const windowStart = fm.index! + fm[0].length
          const windowEnd = i + 1 < fromMatches.length ? fromMatches[i + 1].index! : src.length
          const window = src.slice(windowStart, windowEnd)

          for (const om of window.matchAll(/\.order\(\s*'([a-zA-Z0-9_().]+)'/g)) {
            const col = om[1]
            // Foreign-table order forms ('rel(col)', 'rel.col') are out of
            // scope for this scan.
            if (col.includes('(') || col.includes('.')) continue
            if (columns.has(col)) continue
            if (EXEMPT.some(e => rel.endsWith(e.file) && e.table === table && e.column === col)) continue
            violations.push(`${rel}: .from('${table}')….order('${col}') — '${col}' is not a column of ${table}`)
          }
        })
      }
    }

    expect(
      violations,
      `Phantom ORDER BY columns (PostgREST rejects the whole query):\n` + violations.join('\n')
    ).toEqual([])
  })
})
