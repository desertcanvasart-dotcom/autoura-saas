import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Every PostgREST embed must ride a real foreign key
// ============================================
// A dead embed does not fail the column — it fails the WHOLE query with
// PGRST200, and callers that discard the error render "nothing found".
// Three live instances were found in one sweep (A-item 14): the available-
// rates endpoint embedding suppliers from transportation_rates (no FK — the
// endpoint returned zero transport rates, always), quote-version compare
// embedding a `users` relation that does not exist (500 on every compare),
// and the super-admin tenant page embedding user_profiles from
// tenant_members (member list always empty). postgrest-embed-hints.test.ts
// only watches `alias:table!fkey` shapes in app/api; this scan validates
// every top-level embed in app/ and lib/ against the generated schema's
// Relationships.
//
// A finding is either a bug or goes in the allowlist WITH the evidence that
// the relationship exists (an FK the types file missed, a view, a probe).

const ROOT = path.join(__dirname, '..', '..', '..')
const TYPES = readFileSync(path.join(ROOT, 'types', 'database.types.ts'), 'utf8')

// Verified exceptions: embeds the Relationships blocks cannot express.
const ALLOW: Array<{ from: string; embed: string; reason: string }> = [
]

interface Rel { fkeyName: string; columns: string[]; referencedRelation: string }

function relationships(): Map<string, Rel[]> {
  const map = new Map<string, Rel[]>()
  // Segment the types file per table FIRST (a one-line `Relationships: []`
  // otherwise lets a lazy cross-table regex swallow the next table's block
  // and mis-attribute its foreign keys).
  const headers = [...TYPES.matchAll(/\n {6}([a-z0-9_]+): \{\n {8}Row: \{/g)]
  headers.forEach((h, i) => {
    const start = h.index! + h[0].length
    const end = i + 1 < headers.length ? headers[i + 1].index! : TYPES.length
    const segment = TYPES.slice(start, end)
    const relBlock = segment.match(/\n {8}Relationships: (\[[\s\S]*?\n {8}\]|\[\])/)
    const rels: Rel[] = []
    if (relBlock) {
      const relRe = /foreignKeyName: "([^"]+)"[\s\S]*?columns: \[([^\]]*)\][\s\S]*?referencedRelation: "([^"]+)"/g
      for (const r of relBlock[1].matchAll(relRe)) {
        rels.push({
          fkeyName: r[1],
          columns: [...r[2].matchAll(/"([^"]+)"/g)].map(x => x[1]),
          referencedRelation: r[3],
        })
      }
    }
    map.set(h[1], rels)
  })
  return map
}

const RELS = relationships()

function embedIsValid(table: string, name: string, hint: string | null): boolean {
  const own = RELS.get(table)
  if (!own) return true // not a public table in the types — out of scope
  // Forward: table → name
  if (own.some(r => r.referencedRelation === name)) return true
  // Reverse: name → table
  const theirs = RELS.get(name)
  if (theirs?.some(r => r.referencedRelation === table)) return true
  // `alias:fk_column(...)` — the token is an FK COLUMN of the table.
  if (own.some(r => r.columns.includes(name))) return true
  // Hint naming a real fkey linking the two.
  if (hint && hint !== 'inner') {
    if (own.some(r => r.fkeyName === hint) || theirs?.some(r => r.fkeyName === hint)) return true
    if (own.some(r => r.columns.includes(hint)) || theirs?.some(r => r.columns.includes(hint))) return true
  }
  return false
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

// PostgREST aggregates open parens without being embeds.
const AGGREGATES = new Set(['count', 'sum', 'avg', 'max', 'min'])

interface EmbedNode { name: string; hint: string | null; children: EmbedNode[] }

/** The FULL embed tree of a select string: `alias:name!hint(…)` at every
 *  depth. A dead embed three levels down kills the whole query exactly as a
 *  top-level one does — the guard originally stopped at depth 0 and the
 *  versions routes' nested `changed_by` embeds slid under it. */
function parseEmbeds(select: string): EmbedNode[] {
  const roots: EmbedNode[] = []
  const stack: EmbedNode[] = []
  const re = /(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_]*)(?:!([a-zA-Z0-9_]+))?\s*\(|\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(select))) {
    if (m[0] === ')') {
      stack.pop()
      continue
    }
    const node: EmbedNode = { name: m[2], hint: m[3] ?? null, children: [] }
    ;(stack.length ? stack[stack.length - 1].children : roots).push(node)
    stack.push(node)
  }
  return roots
}

/** The table an embed resolves to, so its OWN children can be validated
 *  against that table's relationships. Null = cannot resolve. */
function resolveEmbedTable(parent: string, name: string, hint: string | null): string | null {
  if (RELS.has(name)) return name
  const own = RELS.get(parent)
  const byColumn = own?.find(r => r.columns.includes(name))
  if (byColumn) return byColumn.referencedRelation
  if (hint && hint !== 'inner') {
    const byHint = own?.find(r => r.fkeyName === hint || r.columns.includes(hint))
    if (byHint) return byHint.referencedRelation
  }
  return null
}

describe('PostgREST embeds ride real foreign keys', () => {
  it('finds no embed without a relationship in the schema', () => {
    const violations: string[] = []
    expect(RELS.size).toBeGreaterThan(50)

    for (const dir of ['app', 'lib']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        const rel = path.relative(ROOT, file)

        const fromMatches = [...src.matchAll(/\.from\(\s*'([a-z0-9_]+)'\s*\)/g)]
        fromMatches.forEach((fm, i) => {
          const table = fm[1]
          const windowEnd = i + 1 < fromMatches.length ? fromMatches[i + 1].index! : src.length
          const window = src.slice(fm.index! + fm[0].length, windowEnd)

          const sel = window.match(/\.select\(\s*(['"`])([\s\S]*?)\1/)
          if (!sel) return
          const check = (parent: string, nodes: EmbedNode[], trail: string) => {
            for (const e of nodes) {
              if (AGGREGATES.has(e.name)) continue
              const label = trail ? `${trail}.${e.name}` : e.name
              if (!embedIsValid(parent, e.name, e.hint) && !ALLOW.some(a => a.from === parent && a.embed === e.name)) {
                violations.push(
                  `${rel}: .from('${table}') embeds '${label}${e.hint ? `!${e.hint}` : ''}' — no foreign key links '${parent}' to it (PGRST200 kills the whole query)`
                )
                continue // children of a dead embed are noise
              }
              if (e.children.length) {
                const childTable = resolveEmbedTable(parent, e.name, e.hint)
                // Unresolvable but valid (allowlisted, or out-of-schema view):
                // nothing to check the children against.
                if (childTable) check(childTable, e.children, label)
              }
            }
          }
          check(table, parseEmbeds(sel[2]), '')
        })
      }
    }

    expect(violations, `Dead PostgREST embeds:\n` + violations.join('\n')).toEqual([])
  })
})
