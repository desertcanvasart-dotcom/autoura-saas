import { describe, it, expect } from 'vitest'
import { formatSailingDaysCell, parseSailingDaysCell } from '@/lib/rates/cruise-sailing'
import { RATE_TABLE_CONFIGS, exportCellValue, validateImportData } from '@/lib/bulk-rate-service'
import { detailColumns } from '@/lib/rates/rate-sheet'

// Operator, 2026-09-25: fill the sailing days of all 132 cruises in one
// sheet instead of 132 forms. The cell is "mon;fri".
const CRUISES = RATE_TABLE_CONFIGS.nile_cruises

describe('the sailing-days cell', () => {
  it('writes the stored keys in week order; blank for no fixed day', () => {
    expect(formatSailingDaysCell(['fri', 'mon'])).toBe('mon;fri')
    expect(formatSailingDaysCell([])).toBe('')
    expect(formatSailingDaysCell(null)).toBe('')
  })

  it('reads what a person types: keys or names, any case, ; , / or spaces', () => {
    for (const cell of ['mon;fri', 'Mon, Fri', 'monday / FRIDAY', 'fri mon', 'mon;fri;mon']) {
      expect(parseSailingDaysCell(cell)).toEqual({ days: ['mon', 'fri'], bad: [] })
    }
  })

  it('blank changes nothing; "any" clears to no fixed day', () => {
    expect(parseSailingDaysCell('')).toEqual({ days: null, bad: [] })
    expect(parseSailingDaysCell('  ')).toEqual({ days: null, bad: [] })
    expect(parseSailingDaysCell('Any')).toEqual({ days: [], bad: [] })
  })

  it('names the words that are not days', () => {
    expect(parseSailingDaysCell('mon;fry').bad).toEqual(['fry'])
  })
})

describe('the cruise sheet carries it', () => {
  it('is a detail column of the one cruise sheet, exported as "mon;fri"', () => {
    expect(detailColumns(CRUISES)).toContain('sailing_days')
    expect(exportCellValue('nile_cruises', { sailing_days: ['mon', 'fri'] }, 'sailing_days')).toBe('mon;fri')
  })

  it('the import preview refuses a mistyped day and reads a good one as keys', () => {
    const base = { cruise_code: 'NC-1', ship_name: 'MS Nile', ship_category: 'deluxe', route_name: 'Luxor-Aswan', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: '4' }
    const bad = validateImportData([{ ...base, sailing_days: 'mon;fry' }], CRUISES)
    expect(bad.errors[0]).toMatchObject({ row: 2, column: 'sailing_days' })
    expect(bad.errors[0].message).toContain('"fry" is not a day')
    const good = validateImportData([{ ...base, sailing_days: 'Monday, Friday' }], CRUISES)
    expect(good.errors).toEqual([])
  })
})
