// Flat tour-template CSV (English-only install): serialize the portable
// columns and parse them back. A Name (JA) column from a bilingual export is
// accepted and ignored; required-field and duplicate-code rows are refused.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { serializeTemplatesCsv, parseTemplatesCsv, sampleTemplateCsv, TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}

describe('serializeTemplatesCsv (no name_ja here)', () => {
  it('emits the portable columns and has no Name (JA) column', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'CAI-DAY-828', template_name: 'Memphis Day Trip', tour_type: 'day_tour', duration_days: 1, cities_covered: ['Cairo', 'Giza'], is_active: true, is_featured: false },
    ])
    const header = csv.trim().split('\n')[0]
    expect(header).toBe(TEMPLATE_CSV_COLUMNS.map(c => c.label).join(','))
    expect(header).not.toContain('Name (JA)')
  })
})

describe('parseTemplatesCsv', () => {
  it('round-trips a serialized sheet', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'NMS601-LND', template_name: 'Cairo & Luxor', tour_type: 'land_tour', duration_days: 6, duration_nights: 5, cities_covered: ['Cairo', 'Luxor'], is_active: true, is_featured: false },
    ])
    const { records, refused } = parseTemplatesCsv(csv, papa)
    expect(refused).toEqual([])
    expect(records[0]).toMatchObject({ template_code: 'NMS601-LND', tour_type: 'land_tour', duration_days: 6, cities_covered: ['Cairo', 'Luxor'] })
  })

  it('accepts but drops a Name (JA) column from a bilingual export', () => {
    const { records } = parseTemplatesCsv('Code,Name,Name (JA),Type,Duration Days\nX-1,Foo,フー,day_tour,1\n', papa)
    expect(records[0].template_code).toBe('X-1')
    expect(records[0]).not.toHaveProperty('name_ja')
  })

  it('skips the sample sheet’s EXAMPLE- guide row (uploading it unedited is a no-op)', () => {
    const { records, refused } = parseTemplatesCsv(sampleTemplateCsv(), papa)
    expect(records).toEqual([])
    expect(refused).toEqual([])
  })

  it('refuses required-field and duplicate-code rows', () => {
    const { records, refused } = parseTemplatesCsv(
      ['Code,Name,Type,Duration Days', 'X-3,Foo,,1', 'DUP,A,day_tour,1', 'DUP,B,day_tour,2'].join('\n'),
      papa,
    )
    expect(records).toHaveLength(1)
    expect(refused.map(r => r.reason)).toEqual([
      '"X-3": missing Type',
      '"DUP" appears more than once in this file',
    ])
  })
})

// ============================================================================
// The four tour fields became tenant vocabulary (358). Three of them now ride
// the sheet: the theme used to be a UUID into tour_categories and was left out
// entirely, which is how a field quietly stops round-tripping — the same way
// the supplier sheet was dropping its link columns (#399–#402).
// ============================================================================

describe('the vocabulary fields survive the round trip', () => {
  const row = {
    template_code: 'CAI-DAY-900',
    template_name: 'Old Cairo Walk',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: ['Cairo'],
    tour_theme: 'cultural',
    physical_level: 'easy',
    best_for: ['families', 'first_time_visitors'],
    is_active: true,
    is_featured: false,
  }

  it('carries a column for each of them', () => {
    const header = serializeTemplatesCsv([row]).trim().split('\n')[0]
    for (const label of ['Theme', 'Physical Level', 'Best For']) {
      expect(header).toContain(label)
    }
  })

  it('returns every value unchanged', () => {
    const { records, refused } = parseTemplatesCsv(serializeTemplatesCsv([row]), papa)
    expect(refused).toEqual([])
    expect(records[0].tour_theme).toBe('cultural')
    expect(records[0].physical_level).toBe('easy')
    expect(records[0].best_for).toEqual(['families', 'first_time_visitors'])
  })

  it('carries KEYS, not the agency\'s labels', () => {
    // A key survives a rename; a label does not. The sheet must not start
    // holding "Families" again just because that is what the form displays.
    const csv = serializeTemplatesCsv([row])
    expect(csv).toContain('families; first_time_visitors')
    expect(csv).not.toContain('Families')
  })

  it('accepts a sheet a human retyped with spaces and pipes', () => {
    const csv = [
      'Code,Name,Type,Duration Days,Theme,Physical Level,Best For',
      'CAI-DAY-901,Islamic Cairo,day_tour,1,cultural,easy,families|seniors',
    ].join('\n')
    const { records, refused } = parseTemplatesCsv(csv, papa)
    expect(refused).toEqual([])
    expect(records[0].best_for).toEqual(['families', 'seniors'])
    expect(records[0].tour_theme).toBe('cultural')
  })

  it('leaves them out when a tour has none, rather than inventing a value', () => {
    const { records } = parseTemplatesCsv(
      serializeTemplatesCsv([{ ...row, tour_theme: null, physical_level: null, best_for: [] }]),
      papa
    )
    expect(records[0].tour_theme).toBeUndefined()
    expect(records[0].physical_level).toBeUndefined()
    expect(records[0].best_for).toBeUndefined()
  })

  it('the sample sheet shows all three filled in', () => {
    // The sample is the instruction manual: a blank column teaches nobody.
    const { records } = parseTemplatesCsv(
      sampleTemplateCsv().replace(/EXAMPLE-/g, 'REAL-'), papa
    )
    expect(records[0].tour_theme).toBeTruthy()
    expect(records[0].physical_level).toBeTruthy()
    expect(records[0].best_for?.length).toBeGreaterThan(0)
  })
})
