// Flat tour-template CSV (English-only install): serialize the portable
// columns and parse them back. A Name (JA) column from a bilingual export is
// accepted and ignored; required-field and duplicate-code rows are refused.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { serializeTemplatesCsv, parseTemplatesCsv, TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

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
