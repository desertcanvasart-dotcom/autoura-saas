import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

// ============================================
// The tour sheet and the table must not drift
// ============================================
// A CSV round trip has to be lossless: export → delete → re-import must give
// back the same tour. The sheet was missing duration_hours (filled on 12 of
// the 26 live templates), age_suitability, gallery_urls and
// destinations_covered (all 26) — so every export quietly dropped them.
//
// Both directions are checked against the GENERATED types, which come from the
// live schema (types/database.types.ts, npm run types:generate):
//   * a column in the table is in the sheet, or is listed here with a reason
//   * a column in the sheet exists in the table
// A migration that adds a column now fails this test until someone decides
// whether the sheet carries it.

/** Why a column of tour_templates is deliberately not in the sheet. */
const NOT_IN_THE_SHEET: Record<string, string> = {
  id: 'database id — a tour is matched by template_code across installs',
  tenant_id: 'the importing tenant owns the row; stamped on insert',
  destination_id: 'local id, meaningless in another install (the names travel in Destinations)',
  primary_destination_id: 'local id, as above',
  created_at: 'bookkeeping',
  updated_at: 'bookkeeping',
  itinerary: 'the day-by-day travels in its own sheet — a flat row cannot hold a nested record',
  cached_starting_price: 'derived from rates, recomputed on the importing install',
  cached_starting_tier: 'derived, as above',
  cached_price_updated_at: 'derived, as above',
  popularity_score: 'behavioural, earned on the install that serves the tour',
}

function tourTemplateColumns(): string[] {
  const types = readFileSync(path.join(__dirname, '..', '..', 'types', 'database.types.ts'), 'utf8')
  const start = types.indexOf('      tour_templates: {')
  expect(start, 'tour_templates must exist in the generated types').toBeGreaterThan(-1)
  const rowStart = types.indexOf('Row: {', start)
  const rowEnd = types.indexOf('}', rowStart)
  return types
    .slice(rowStart, rowEnd)
    .split('\n')
    .map(line => line.match(/^\s{10,}([a-z_0-9]+)(\?)?:/)?.[1])
    .filter((c): c is string => Boolean(c))
}

describe('the tour sheet against the table', () => {
  const columns = tourTemplateColumns()
  const sheet = new Set(TEMPLATE_CSV_COLUMNS.map(c => c.name))

  it('reads the generated types', () => {
    expect(columns.length).toBeGreaterThan(20)
    expect(columns).toContain('template_code')
  })

  it('every column travels, or says why it does not', () => {
    const dropped = columns.filter(c => !sheet.has(c) && !(c in NOT_IN_THE_SHEET))
    expect(
      dropped,
      'these columns are silently lost by an export → re-import. Add them to ' +
        'TEMPLATE_CSV_COLUMNS, or to NOT_IN_THE_SHEET with the reason:\n  ' +
        dropped.join('\n  ')
    ).toEqual([])
  })

  it('every column in the sheet exists in the table', () => {
    const phantom = TEMPLATE_CSV_COLUMNS.map(c => c.name).filter(c => !columns.includes(c))
    expect(phantom, 'the sheet names columns the table does not have').toEqual([])
  })

  it('the exclusion list does not go stale', () => {
    const gone = Object.keys(NOT_IN_THE_SHEET).filter(c => !columns.includes(c))
    expect(gone, 'these columns no longer exist — remove them from NOT_IN_THE_SHEET').toEqual([])
  })

  it('carries the four fields the live data actually had', () => {
    for (const c of ['duration_hours', 'age_suitability', 'gallery_urls', 'destinations_covered']) {
      expect(sheet.has(c), c).toBe(true)
    }
  })
})
