import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// The Tour Manager reports what actually happened
// ============================================
// Two silent failures, both in the same screen:
//
//   * Export was `window.location.href = '/api/tours/bulk/export'`. That route
//     answers JSON on failure, so a failed export either replaced the page
//     with raw JSON or did nothing at all — the operator saw no error.
//   * Import showed only `json.error` when the route reported success:false,
//     and skipped the refresh. The route imports ROW BY ROW, so a partial
//     failure had already created and updated tours: the counts were dropped
//     and the list still claimed those tours did not exist.

const SOURCE = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'tours', 'manage', 'TourManagerContent.tsx'),
  'utf8'
)

describe('CSV export', () => {
  it('never navigates the page at a JSON route', () => {
    expect(SOURCE).not.toMatch(/window\.location\.href\s*=\s*['"`]\/api\/tours\/bulk\/export/)
  })

  it('fetches, and reports the route’s own reason in place', () => {
    const helper = SOURCE.slice(SOURCE.indexOf('const downloadCsv'), SOURCE.indexOf('const handleExportDays'))
    expect(helper).toContain('await fetch(url)')
    expect(helper).toMatch(/if \(!res\.ok\)/)
    expect(helper).toContain('body.error')
    expect(helper).toMatch(/showToast\('error'/)
  })

  it('covers both sheets', () => {
    expect(SOURCE).toContain("downloadCsv(\n      '/api/tours/bulk/export-days'")
    expect(SOURCE).toContain("downloadCsv(\n      '/api/tours/bulk/export'")
  })
})

describe('CSV import', () => {
  const handlers = [
    SOURCE.slice(SOURCE.indexOf('const handleImportDays'), SOURCE.indexOf('const handleExportTemplates')),
    SOURCE.slice(SOURCE.indexOf('const handleImportFile'), SOURCE.indexOf('const handleAddNew')),
  ]

  it('says what landed even when the import failed part way', () => {
    for (const handler of handlers) {
      expect(handler).toMatch(/const landed =/)
      expect(handler).toMatch(/before it stopped/)
    }
  })

  it('refreshes the list whenever rows landed', () => {
    for (const handler of handlers) {
      expect(handler).toMatch(/if \(landed > 0 \|\| json\.success\) fetchTemplates\(\)/)
    }
  })

  it('still names the first refused row and the ignored columns', () => {
    const templates = handlers[1]
    expect(templates).toContain('firstReason')
    expect(templates).toContain('ignoredHeaders')
  })
})
