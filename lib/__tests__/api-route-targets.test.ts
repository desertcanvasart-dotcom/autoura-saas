// Guard: every /api/... path a client component fetches must resolve to a
// real route file.
//
// Written after three call sites were found pointing at routes that have
// never existed in this app: /api/vehicles (calendar, ResourceAssignmentV2,
// ResourceSummaryCard) and /api/tour-templates (settings/capacity). The
// calendar case was the damaging one -- it fetched four endpoints in a
// Promise.all and then called .json() on all four, so the 404's HTML page
// threw and the entire data load (bookings, resources, guides) aborted.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Route segments a request path can satisfy: literal, [id], [...slug]. */
function routeExists(segments: string[]): boolean {
  const walkSeg = (dir: string, i: number): boolean => {
    if (i === segments.length) {
      try {
        statSync(join(dir, 'route.ts'))
        return true
      } catch {
        try {
          statSync(join(dir, 'route.tsx'))
          return true
        } catch {
          return false
        }
      }
    }
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false
    }
    // Literal match first, then a dynamic segment, then a catch-all.
    if (entries.includes(segments[i]) && walkSeg(join(dir, segments[i]), i + 1)) return true
    for (const e of entries) {
      if (/^\[\.\.\..+\]$/.test(e)) {
        try {
          statSync(join(dir, e, 'route.ts'))
          return true
        } catch { /* keep looking */ }
      }
      if (/^\[[^.].*\]$/.test(e) && walkSeg(join(dir, e), i + 1)) return true
    }
    return false
  }
  return walkSeg(join(ROOT, 'app', 'api'), 0)
}

/** Does app/api/<segments> exist as a directory (literal or dynamic)? */
function dirExists(segments: string[]): boolean {
  let dir = join(ROOT, 'app', 'api')
  for (const seg of segments) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false
    }
    const match =
      entries.find((e) => e === seg) ?? entries.find((e) => /^\[.*\]$/.test(e))
    if (!match) return false
    dir = join(dir, match)
  }
  return true
}

describe('client fetches target real API routes', () => {
  it('every /api path referenced in app/ and components/ has a route file', () => {
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
      // Route handlers themselves reference their own paths in comments and
      // may proxy externally; only scan what the browser calls.
      .filter((f) => !f.includes(join('app', 'api')))

    const broken: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const re = /['"`](\/api\/[A-Za-z0-9_\-/]+?)(\?|['"`]|\$\{)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        const interpolated = m[2] === '${'
        // `/api/quotes/${id}/versions` can't be resolved statically -- only
        // its literal prefix is known. Requiring a route.ts there would be
        // wrong (the route lives under [id]/versions), so for those we
        // assert the weaker, still-useful thing: the prefix directory must
        // exist. /api/vehicles/${id} failed even that -- app/api/vehicles
        // has never existed.
        const path = m[1].replace(/\/$/, '')
        const segments = path.split('/').filter(Boolean).slice(1)
        if (segments.length === 0) continue
        const ok = interpolated
          ? dirExists(segments)
          : routeExists(segments)
        if (!ok) broken.push(`${file.replace(ROOT + '/', '')}: ${path}`)
      }
    }

    expect(broken).toEqual([])
  })
})
