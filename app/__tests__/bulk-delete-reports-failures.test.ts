import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// Check 13's shape, one layer up: a bulk action that reports success while
// deleting nothing.
//
// The rate pages delete N rows by calling the per-id DELETE endpoint once per
// selected id through Promise.allSettled — deliberately, because those routes
// carry the auth and write-protection guards a new bulk endpoint would have to
// re-implement. But allSettled NEVER REJECTS. Ignore its results and a run
// where every request 403s is indistinguishable from one where all succeeded:
// the toast says "Deleted 6 rate(s)", the list refetches unchanged, and the
// operator believes stale rates are gone.
//
// That is exactly the sibling's cascade bug (app/api/__tests__/
// delete-error-checks.test.ts) wearing a UI hat, so it gets the same
// treatment: every bulk-delete handler must look at what allSettled returned.
//
// The check is deliberately shallow — it proves the results are INSPECTED, not
// that the arithmetic is right. A source scan cannot know what the count means.
// ============================================================================

const RATES_DIR = path.resolve(__dirname, '../rates')

function rateFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) rateFiles(p, out)
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

describe('bulk delete must report what actually happened', () => {
  const withBulk = rateFiles(RATES_DIR).filter((f) =>
    fs.readFileSync(f, 'utf8').includes('handleBulkDelete')
  )

  it('finds the bulk-delete pages at all (a silent zero would pass vacuously)', () => {
    expect(withBulk.length).toBeGreaterThanOrEqual(10)
  })

  it('every handler inspects its allSettled results and can report a partial failure', () => {
    const offenders: string[] = []

    for (const file of withBulk) {
      const src = fs.readFileSync(file, 'utf8')
      const rel = path.relative(RATES_DIR, file)

      // The fan-out itself: one request per id, none allowed to abort the rest.
      if (!/allSettled/.test(src)) {
        offenders.push(`${rel}: bulk delete does not use Promise.allSettled`)
        continue
      }

      // The results must be READ. `status === 'fulfilled'` (or a .filter over
      // them) is the only way to tell a 403 from a deletion.
      if (!/fulfilled/.test(src)) {
        offenders.push(`${rel}: allSettled results are never inspected`)
      }

      // A settled promise carrying a 4xx Response is still "fulfilled" — the
      // handler has to look at response.ok too, or every rejected delete is
      // counted as a success.
      if (!/\.ok\b/.test(src)) {
        offenders.push(`${rel}: a fulfilled non-ok response would count as deleted`)
      }
    }

    expect(
      offenders,
      'These bulk deletes can report success for rows that were never deleted:\n' +
        offenders.join('\n')
    ).toEqual([])
  })

  it('the confirmation is never skipped — bulk delete is irreversible', () => {
    // Scoped to the handler's OWN body on purpose. Searching the whole file
    // passes on every page here for a reason that has nothing to do with bulk
    // delete: `confirmDelete` is also the name of the SINGLE-delete confirm
    // function on the guides/activities/meals pages. That is check 13's
    // recorded failure — "an earlier version of this test passed the very bug
    // it was written for" — so the window is the function, not the file.
    const offenders: string[] = []

    for (const file of withBulk) {
      const src = fs.readFileSync(file, 'utf8')
      const rel = path.relative(RATES_DIR, file)

      const start = src.indexOf('const handleBulkDelete')
      const open = src.indexOf('{', start)
      let depth = 0
      let end = open
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}' && --depth === 0) {
          end = i
          break
        }
      }
      const body = src.slice(start, end + 1)

      // Two legitimate gates, and no third:
      //   1. the handler awaits the shared confirm dialog itself, or
      //   2. the handler IS a modal's confirm action — the action-bar button
      //      opens `bulkDeleteModal` and only its Delete button calls this.
      const confirmsInline = /dialog\.(confirmDelete|confirm)\s*\(/.test(body)
      const gatedByModal =
        /bulkDeleteModal/.test(src) && /setBulkDeleteModal\(true\)/.test(src)

      if (!confirmsInline && !gatedByModal) {
        offenders.push(`${rel}: handleBulkDelete runs with nothing confirming it`)
      }
    }

    expect(
      offenders,
      'These pages delete many rows with no confirmation step:\n' + offenders.join('\n')
    ).toEqual([])
  })
})
