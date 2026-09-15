import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import { sampleTemplateCsv, parseTemplatesCsv } from '@/lib/tours/template-csv'
import { sampleDaysCsv, parseDaysCsv, SAMPLE_TOUR_DAYS } from '@/lib/tours/itinerary-csv'
import { summarizeMeals } from '@/lib/tours/day-meals'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}
const CODE = 'DEMO-001'

// ============================================================================
// The two sample sheets are the format reference. Someone who uses them
// "exactly as they are" must get ONE coherent tour — the template sample once
// described a one-day tour while the days sample described a two-day one with
// two hotel nights, which the engine would have priced onto a day trip.
// ============================================================================

describe('the two sample sheets describe one tour', () => {
  const tpl = parseTemplatesCsv(sampleTemplateCsv().replace(/EXAMPLE-REPLACE-THIS-CODE/g, CODE), papa).records[0]
  const days = parseDaysCsv(sampleDaysCsv().replace(/EXAMPLE-REPLACE-THIS-CODE/g, CODE), papa).byTemplate.get(CODE)!

  it('share the same example code, so replacing it once keeps them linked', () => {
    expect(sampleTemplateCsv()).toContain('EXAMPLE-REPLACE-THIS-CODE')
    expect(sampleDaysCsv()).toContain('EXAMPLE-REPLACE-THIS-CODE')
  })

  it('have as many days as the template says the tour lasts', () => {
    expect(days).toHaveLength(Number(tpl.duration_days))
  })

  it('a day tour books no hotel night', () => {
    // Nights are counted from the days, never from duration_nights.
    expect(tpl.tour_type).toBe('day_tour')
    for (const d of days) expect(d.accommodation_type).toBe('none')
  })

  it("the template's Meals Included is exactly what the days derive", () => {
    // It is written from the same fixture, so this cannot drift — the test is
    // here so nobody hand-types it back in.
    const cell = sampleTemplateCsv().split('\n')[1].match(/"([^"]*)"/g)!.map(c => c.slice(1, -1))
    const mealsCell = cell.find(c => c.startsWith('Day 1:'))
    expect(mealsCell).toBe(summarizeMeals(SAMPLE_TOUR_DAYS).join('; '))
    expect(mealsCell).toBe('Day 1: Lunch (restaurant)')
  })

  it('states every meal on every day — the rule the sheet enforces on everyone', () => {
    for (const d of days) {
      const m = d.meals as Record<string, string>
      for (const k of ['breakfast', 'lunch', 'dinner']) expect(['included', 'external', 'none']).toContain(m[k])
    }
  })
})

describe('the template sample only uses vocabulary every tenant is seeded with', () => {
  // A sample that names a key one tenant added by hand would be refused
  // everywhere else. These are read straight out of the seed migration.
  const seed = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/358_tour_fields_vocabulary.sql'), 'utf8')
  const tpl = parseTemplatesCsv(sampleTemplateCsv().replace(/EXAMPLE-REPLACE-THIS-CODE/g, CODE), papa).records[0]

  it.each([
    ['tour_type', 'tour_type'],
    ['tour_theme', 'tour_theme'],
    ['physical_level', 'tour_physical_level'],
  ] as const)('%s is a seeded key', (field, kind) => {
    expect(seed).toContain(`'${kind}', '${tpl[field]}'`)
  })

  it('every best_for tag is a seeded key', () => {
    for (const tag of tpl.best_for ?? []) expect(seed).toContain(`'tour_best_for', '${tag}'`)
  })
})
