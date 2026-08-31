// Every column the code WRITES must exist in the live schema.
//
// The class this kills has caused real incidents in both apps: payments sat
// at 0 rows because every insert 400'd on a column that did not exist; the
// sibling's WhatsApp inbox shipped a whole assignment feature against columns
// nobody migrated; C01-style "silent failures" start life exactly here.
//
// types/database.types.ts is generated from the LIVE production schema
// (scripts/generate-db-types.mjs). This test parses it for each table's
// columns, then scans every .from('t').insert({...}) / .update({...}) whose
// argument is an object literal, and fails on any literal key the table does
// not have. Spreads and computed keys are skipped — the test aims for zero
// false positives, not total coverage; the compile-time answer is wiring the
// Database generic through the client factories (the sibling did; 225 call
// sites — tracked as follow-up).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

function requiredInsertColumns(): Map<string, Set<string>> {
  const src = readFileSync(join(ROOT, 'types', 'database.types.ts'), 'utf8')
  const out = new Map<string, Set<string>>()
  const tableRe = /^ {6}([a-z_0-9]+): \{\n {8}Row: \{[\s\S]*?\n {8}Insert: \{\n([\s\S]*?)\n {8}\}/gm
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(src)) !== null) {
    const cols = new Set<string>()
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^ {10}([a-z_0-9]+):/) // no `?` → required on insert
      if (cm) cols.add(cm[1])
    }
    out.set(m[1], cols)
  }
  return out
}

function tableColumns(): Map<string, Set<string>> {
  const src = readFileSync(join(ROOT, 'types', 'database.types.ts'), 'utf8')
  const out = new Map<string, Set<string>>()
  const tableRe = /^ {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(src)) !== null) {
    const cols = new Set<string>()
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^ {10}([a-z_0-9]+)\??:/)
      if (cm) cols.add(cm[1])
    }
    out.set(m[1], cols)
  }
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.') || e === '__tests__') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

/** Top-level `key:` names of an object literal starting at src[open] === '{'. */
function literalKeys(src: string, open: number): { keys: string[]; hasSpread: boolean } | null {
  let depth = 0
  let i = open
  const keys: string[] = []
  let hasSpread = false
  let lineStart = true
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') {
      depth--
      if (depth === 0) break
    } else if (depth === 1 && lineStart) {
      const rest = src.slice(i, i + 80)
      const km = rest.match(/^([a-z_0-9]+)\s*:/)
      if (km) keys.push(km[1])
      if (rest.startsWith('...')) hasSpread = true
    }
    lineStart = ch === '\n' || (lineStart && /\s/.test(ch)) || ch === ',' || ch === '{'
  }
  if (depth !== 0) return null
  return { keys, hasSpread }
}


/** Where the write's object literal starts: inline, or a same-file
 *  `const NAME = {` when the argument is an identifier. The day-tour bug
 *  lived in `.insert([templateData])` — invisible to an inline-only scan,
 *  which is why this resolver exists. */
function resolveLiteralStart(src: string, argStart: number): number | null {
  const arg = src.slice(argStart, argStart + 120)
  const inline = arg.match(/^\s*\[?\s*\{/)
  if (inline) return argStart + inline[0].length - 1
  const ident = arg.match(/^\s*\[?\s*([A-Za-z_$][\w$]*)\s*[\])]/)
  if (!ident) return null
  const def = new RegExp(`const ${ident[1]}(?:\\s*:[^=]+)? = \\{`).exec(src)
  if (!def) return null
  return def.index + def[0].length - 1
}

describe('database write contract', () => {
  const columns = tableColumns()

  it('parses the generated types (sanity)', () => {
    expect(columns.size).toBeGreaterThan(100)
    expect(columns.get('itineraries')).toBeDefined()
  })

  it('no `X || null` is written into a column that is NOT NULL', () => {
    // `|| null` coerces every falsy value — including a legitimate 0 or ''
    // — to null. Into a NOT NULL column that is a guaranteed 400 the moment
    // the falsy value arrives. Caught live: duration_nights: body.value ||
    // null rejected every day-tour template (0 nights) ever created.
    const required = requiredInsertColumns()
    const violations: string[] = []
    for (const dir of ['app', 'lib']) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        const re = /\.from\(\s*'([a-z_0-9]+)'\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|upsert)\(/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src)) !== null) {
          const req = required.get(m[1])
          if (!req) continue
          const open = resolveLiteralStart(src, m.index + m[0].length)
          if (open === null) continue
          // Depth-aware: only TOP-LEVEL keys of the insert literal count — a
          // nested `question: x || null` inside a jsonb value is fine (first
          // draft flagged exactly that and nearly "fixed" a real field).
          let depth = 0
          let i = open
          let lineStart = i
          for (; i < src.length; i++) {
            const ch = src[i]
            if (ch === '{' || ch === '(' || ch === '[') depth++
            else if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) break }
            else if (ch === '\n') {
              const line = src.slice(lineStart, i)
              lineStart = i + 1
              if (depth !== 1) continue
              // The value must be a plain expression ending in `|| null` — an
              // object/array opener before it means the null belongs to some
              // NESTED key on the same line (metadata: { q: x || null }), not
              // to this column.
              const lm = line.match(/^\s*([a-z_0-9]+):\s*[^{}[\]]+\|\|\s*null\s*,?\s*$/)
              if (lm && req.has(lm[1])) {
                violations.push(`${file.replace(ROOT + '/', '')}: ${m[1]}.${lm[1]} = … || null but the column is NOT NULL`)
              }
            }
          }
        }
      }
    }
    expect(violations, 'These coerce falsy values to null into NOT NULL columns — use ?? or a real default').toEqual([])
  })

  it('every literal insert/update key exists in the live schema', () => {
    const violations: string[] = []
    for (const dir of ['app', 'lib']) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        // Tempered window: the stretch between .from() and the write must not
        // contain another .from( — otherwise a select-chain followed by a
        // different table's insert gets misattributed (first run did exactly
        // that, blaming team_members for a portal_messages insert).
        const re = /\.from\(\s*'([a-z_0-9]+)'\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|update|upsert)\(/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src)) !== null) {
          const table = m[1]
          const cols = columns.get(table)
          if (!cols) continue // views / tables not in the public schema dump
          const open = resolveLiteralStart(src, m.index + m[0].length)
          if (open === null) continue
          const lit = literalKeys(src, open)
          if (!lit) continue
          for (const k of lit.keys) {
            if (!cols.has(k)) {
              violations.push(
                `${file.replace(ROOT + '/', '')}: ${m[3]} into ${table}.${k} — column does not exist`
              )
            }
          }
        }
      }
    }
    expect(
      violations,
      'These writes name columns the live schema does not have — the insert/update will 400 at runtime. ' +
        'Either the column is missing a migration, or the code is wrong. ' +
        '(Regenerate types with `npm run types:generate` if the schema moved.)'
    ).toEqual([])
  })
})
