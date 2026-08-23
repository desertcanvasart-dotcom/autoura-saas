import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// Check 13: cascades that report success while deleting nothing.
//
// The sibling's client force-delete ran a multi-step cascade, discarded every
// child delete's error, and returned success while the days and services
// stayed behind. The lesson recorded there was "the unchecked error, not the
// column".
//
// This repo had the same shape in app/api/tours/templates/[id]: six deletes,
// only the LAST one checked — and the last one is the parent. So any child
// failure removed the template and left its days, activities, variations,
// services and pricing behind, now unreachable because the row they hang off
// was gone. Orphans nothing can list are worse than a failed delete; a failed
// delete can be retried.
//
// A `.delete()` whose result is thrown away cannot fail loudly, so this
// requires every one to have its error examined somewhere in the enclosing
// code.
//
// The window is deliberately wide (25 lines). Supabase queries are often built
// across several statements and awaited later —
//
//   let query = supabase.from('x').delete()
//   if (a) query = query.eq(...)
//   const { error } = await query
//
// — and a narrow window reports those as unchecked. An earlier 8-line pass
// flagged two such sites that were correct all along.
// ============================================================================

const API_DIR = path.resolve(__dirname, '..')

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__') routeFiles(p, out)
    } else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

describe('delete paths must check their own errors', () => {
  const files = routeFiles(API_DIR)

  it('finds route files at all (a silent zero would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('no .delete() may have its result discarded', () => {
    const offenders: string[] = []

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')

      lines.forEach((line, i) => {
        if (!line.includes('.delete()')) return

        // Find the START of the statement this .delete() belongs to, walking
        // back over the chained builder lines. A window-based scan is not
        // enough: neighbouring CHECKED deletes put the word "error" nearby and
        // hide an unchecked one sitting between them — verified, an earlier
        // version of this test passed the very bug it was written for.
        let start = i
        for (let k = 0; k < 8 && start > 0; k++) {
          const t = lines[start].trim()
          if (/^(const|let|var|return|await|if|})/.test(t)) break
          start--
        }
        const stmt = lines[start].trim()

        // Fine: the result is captured (`const { error } = await ...`), or the
        // builder is assigned for a deferred await (`let query = ...`), or the
        // call is returned to a caller that must handle it.
        if (/^(const|let|var)\s/.test(stmt) || /^return\b/.test(stmt)) {
          if (/^(const|let|var)\s/.test(stmt) && !/=/.test(lines.slice(start, i + 1).join(' '))) {
            offenders.push(`${path.relative(API_DIR, file)}:${i + 1}`)
          }
          return
        }

        // Offender: a bare `await supabase...delete()` whose result goes nowhere.
        if (/^await\b/.test(stmt)) {
          offenders.push(`${path.relative(API_DIR, file)}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      'These deletes discard their result, so a failure returns success:\n' +
        offenders.join('\n')
    ).toEqual([])
  })
})
