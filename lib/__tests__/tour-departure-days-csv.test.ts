import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { serializeTemplatesCsv, parseTemplatesCsv as parseWith } from '@/lib/tours/template-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}
const parseTemplatesCsv = (csv: string) => parseWith(csv, papa)

// ============================================================================
// A tour's departure weekdays (migration 441) travel through the tours sheet:
// exported as "mon;fri", read back exactly; "daily" on a TOUR means all seven
// days stated (on a cruise it means no fixed day); a word that is not a day is
// refused by name; a blank clears it (not stated).
// ============================================================================

const base = { template_code: 'NILE-1', template_name: 'Nile', tour_type: 'multi_day', duration_days: 4 }
const parse = (cell: string) => parseTemplatesCsv(`Code,Name,Type,Duration Days,Departure Days\nNILE-1,Nile,multi_day,4,"${cell}"\n`)

describe('departure days in the tours sheet', () => {
  it('round-trips exactly', () => {
    const csv = serializeTemplatesCsv([{ ...base, departure_days: ['fri', 'mon'] }])
    expect(csv).toContain('mon;fri')
    expect(parseTemplatesCsv(csv).records[0].departure_days).toEqual(['mon', 'fri'])
  })
  it('reads day names in the usual spellings', () => {
    expect(parse('Monday, Thu').records[0].departure_days).toEqual(['mon', 'thu'])
  })
  it('"daily" on a tour is every day, stated', () => {
    expect(parse('daily').records[0].departure_days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })
  it('a word that is not a day refuses the row, saying which', () => {
    const r = parse('mon, funday')
    expect(r.records).toEqual([])
    expect(r.refused[0].reason).toMatch(/Departure Days "mon, funday": funday is not a weekday/)
  })
  it('"none" states nothing — it is never read as every day', () => {
    expect(parse('none').records[0].departure_days).toEqual([])
  })
  it('blank clears it — not stated', () => {
    expect(parse('').records[0].departure_days).toEqual([])
  })
})
