// A ratchet on `select('*')`, in the same spirit as the lint ratchet.
//
// Finding #9: ~228 star-selects couple routes to the full row shape and bloat
// payloads, and there is no safe bulk rewrite (each needs to know which
// columns its consumer reads — narrowing blind is exactly the missing-column
// class of bug this codebase has hit). So rather than churn them all, this
// freezes the count: it may only go DOWN. A new `select('*')` fails the build;
// narrowing an existing one lets you lower BASELINE and lock the win in.
//
// Not a lint rule because the ORM call is data, not a lintable AST pattern the
// project's config models — a source scan is the honest, low-friction guard.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const STAR = /\.select\(\s*['"`]\*['"`]/g

// The count on 2026-08-31, after narrowing the head:true count queries (where
// the star was inert). Lower this — never raise it — as star-selects are
// replaced with explicit column lists.
const BASELINE = 277

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    if (entry === '__tests__') continue // fixtures legitimately use select('*')
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('select(*) ratchet', () => {
  it(`does not exceed the frozen baseline of ${BASELINE}`, () => {
    let count = 0
    const hotspots: Array<[string, number]> = []
    for (const dir of ['app', 'lib']) {
      for (const file of walk(join(ROOT, dir))) {
        const n = (readFileSync(file, 'utf8').match(STAR) ?? []).length
        if (n > 0) {
          count += n
          hotspots.push([file.replace(ROOT + '/', ''), n])
        }
      }
    }
    // A helpful failure: if it grew, name the worst offenders to narrow.
    if (count > BASELINE) {
      hotspots.sort((a, b) => b[1] - a[1])
      console.error('select(*) over baseline. Heaviest files:\n' +
        hotspots.slice(0, 10).map(([f, n]) => `  ${n}  ${f}`).join('\n'))
    }
    expect(count, 'a new select(\'*\') was added — narrow it to explicit columns instead').toBeLessThanOrEqual(BASELINE)
    // If you narrowed some, this reminds you to lower BASELINE and lock it in.
    expect(count, `select('*') dropped to ${count}; lower BASELINE to match`).toBe(BASELINE)
  })
})
