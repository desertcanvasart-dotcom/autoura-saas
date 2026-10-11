import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchAllPages, DEFAULT_PAGE_SIZE } from '@/lib/db/fetch-all-pages'
import { supplierTypesOrFilter } from '@/lib/suppliers/type-filter'
import { isRealCalendarDate, isRealIsoDate, dateShapeIsReal } from '@/lib/rates/calendar-date'
import { validateImportData, type RateTableConfig } from '@/lib/bulk-rate-service'
import { parsePeriodsCsv } from '@/lib/rates/periods-csv'

// ============================================
// Documents audit, round 12 — part 4 (supplier & rate data)
// ============================================
// Suppliers matched on one legacy type, rate tables missing from the
// supplier's Rates tab, reads that stopped at PostgREST's 1000 rows, and
// rate CSVs that accepted 30 February.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('fetchAllPages', () => {
  const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))
  const pager = (rows: Array<{ id: number }>) => {
    const calls: Array<[number, number]> = []
    const fetchPage = async (from: number, to: number) => {
      calls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    }
    return { calls, fetchPage }
  }

  it('reads past the first 1000 rows', async () => {
    const { calls, fetchPage } = pager(table(2500))
    const { data, error } = await fetchAllPages(fetchPage)
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('an exact multiple of the page size costs one empty page, then stops', async () => {
    const { calls, fetchPage } = pager(table(DEFAULT_PAGE_SIZE))
    const { data } = await fetchAllPages(fetchPage)
    expect(data).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(calls).toHaveLength(2)
  })

  it('an empty table is one call and no rows; null data reads as none', async () => {
    const { data, error } = await fetchAllPages(async () => ({ data: null, error: null }))
    expect(data).toEqual([])
    expect(error).toBeNull()
  })

  it('honours a custom page size', async () => {
    const { calls, fetchPage } = pager(table(5))
    const { data } = await fetchAllPages(fetchPage, 2)
    expect(data.map(r => r.id)).toEqual([0, 1, 2, 3, 4])
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('stops at the first error and returns it with the rows read so far', async () => {
    let n = 0
    const { data, error } = await fetchAllPages(async (from, to) => {
      n++
      if (n === 2) return { data: null, error: { message: 'boom' } }
      return { data: table(to - from + 1), error: null }
    }, 10)
    expect(error).toEqual({ message: 'boom' })
    expect(data).toHaveLength(10)
  })
})

describe('supplierTypesOrFilter', () => {
  it('matches any of the types array OR the legacy supplier_type', () => {
    expect(supplierTypesOrFilter(['guide'])).toBe('types.ov.{guide},supplier_type.in.(guide)')
    expect(supplierTypesOrFilter(['transport_company', 'driver', 'driver']))
      .toBe('types.ov.{transport_company,driver},supplier_type.in.(transport_company,driver)')
  })

  it('never lets filter syntax through, and gives null for no usable key', () => {
    expect(supplierTypesOrFilter(['guide),id.neq.(x', ' '])).toBeNull()
    expect(supplierTypesOrFilter([])).toBeNull()
    expect(supplierTypesOrFilter(['tour-leader', 'bad,key'])).toBe('types.ov.{tour-leader},supplier_type.in.(tour-leader)')
  })
})

describe('guide picker and vehicle list match every role (wiring)', () => {
  it('/api/guides no longer filters on supplier_type alone', () => {
    const s = src('app/api/guides/route.ts')
    expect(s).not.toContain(".eq('supplier_type', 'guide')")
    expect(s).toContain("supplierTypeKeysForBehaviors(authResult.supabase, ['guide'])")
    expect(s).toContain('.or(supplierTypesOrFilter(guideKeys)')
  })

  it('/api/resources/vehicles matches the types array too', () => {
    const s = src('app/api/resources/vehicles/route.ts')
    expect(s).not.toContain("'supplier_type.eq.transport_company,supplier_type.eq.transport,supplier_type.eq.driver'")
    expect(s).toContain('.or(supplierTypesOrFilter(transportKeys)')
  })
})

describe('supplier Rates tab covers airlines, rail and assistants (wiring)', () => {
  const s = src('app/api/supplier-rates/route.ts')
  it.each([
    ["airline: ['flight_rates']"],
    ["train_operator: ['train_rates', 'sleeping_train_rates']"],
    ["ground_handler: ['airport_staff_rates', 'hotel_staff_rates']"],
    ["airport_assistant: ['airport_staff_rates']"],
    ["hotel_assistant: ['hotel_staff_rates']"],
  ])('maps %s', line => {
    expect(s).toContain(line)
  })

  it('tenant-scopes the new tables (the route reads with the admin client)', () => {
    const block = s.slice(s.indexOf('const SHARED_CATALOG_TABLES'), s.indexOf('export async function GET'))
    for (const t of ['flight_rates', 'airport_staff_rates', 'hotel_staff_rates']) expect(block).toContain(`'${t}'`)
  })

  it('every table named there has supplier_id in the generated types', () => {
    const types = src('types/database.types.ts')
    for (const t of ['flight_rates', 'train_rates', 'sleeping_train_rates', 'airport_staff_rates', 'hotel_staff_rates']) {
      const start = types.indexOf(`      ${t}: {\n        Row: {`)
      expect(start, t).toBeGreaterThan(0)
      const row = types.slice(start, types.indexOf('Insert:', start))
      expect(row, t).toContain('supplier_id:')
    }
  })
})

describe('reads past 1000 rows (wiring)', () => {
  it.each([
    'app/api/rates/bulk/export/route.ts',
    'app/api/suppliers/import/route.ts',
    'app/api/rates/bulk/import/route.ts',
  ])('%s pages with fetchAllPages + range', p => {
    const s = src(p)
    expect(s).toContain("from '@/lib/db/fetch-all-pages'")
    expect(s).toContain('fetchAllPages((from, to)')
    expect(s).toContain('.range(from, to)')
  })
})

describe('calendar dates', () => {
  it('isRealCalendarDate', () => {
    expect(isRealCalendarDate(2026, 2, 28)).toBe(true)
    expect(isRealCalendarDate(2026, 2, 29)).toBe(false)
    expect(isRealCalendarDate(2028, 2, 29)).toBe(true)
    expect(isRealCalendarDate(2100, 2, 29)).toBe(false)
    expect(isRealCalendarDate(2026, 4, 31)).toBe(false)
    expect(isRealCalendarDate(2026, 13, 1)).toBe(false)
    expect(isRealCalendarDate(2026, 0, 1)).toBe(false)
    expect(isRealCalendarDate(2026, 12, 31)).toBe(true)
  })

  it('isRealIsoDate wants exactly YYYY-MM-DD naming a real day', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true)
    expect(isRealIsoDate('2026-02-30')).toBe(false)
    expect(isRealIsoDate('2026-2-3')).toBe(false)
    expect(isRealIsoDate('2026-02-28T00:00:00Z')).toBe(false)
  })

  it('dateShapeIsReal refuses impossible date-shaped values only', () => {
    expect(dateShapeIsReal('2026-02-30')).toBe(false)
    expect(dateShapeIsReal('2026-02-28')).toBe(true)
    expect(dateShapeIsReal('2026-02-28T10:00:00+00:00')).toBe(true)
    expect(dateShapeIsReal('2026-02-31T10:00:00Z')).toBe(false)
    expect(dateShapeIsReal('31/02/2026')).toBe(false)
    expect(dateShapeIsReal('13/13/2026')).toBe(false)
    expect(dateShapeIsReal('25/12/2026')).toBe(true)
    expect(dateShapeIsReal('12/25/2026')).toBe(true)
  })
})

describe('rate CSVs refuse 30 February', () => {
  const config: RateTableConfig = {
    tableName: 'test_rates',
    displayName: 'Test',
    uniqueKey: ['code'],
    columns: [
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'valid_from', label: 'Valid From', type: 'date', required: false },
    ],
  }

  it('flat bulk format: an impossible date is a row error, a real one passes', () => {
    const preview = validateImportData([
      { code: 'A', valid_from: '2026-02-30' },
      { code: 'B', valid_from: '2026-02-28' },
      { code: 'C', valid_from: '' },
    ], config)
    expect(preview.validRows).toBe(2)
    expect(preview.invalidRows).toBe(1)
    expect(preview.errors).toHaveLength(1)
    expect(preview.errors[0]).toMatchObject({ row: 2, column: 'valid_from' })
    expect(preview.errors[0].message).toContain('not a real date')
  })

  it('periods format: From/To must be real days', () => {
    const base = { 'Service Code': 'ACC-1', 'Property Name': 'Hotel', 'Period Name': 'P', 'PP Double (EU passport)': '100' }
    const sheet = parsePeriodsCsv([
      { ...base, From: '2026-02-01', To: '2026-02-30' },
      { ...base, From: '2026-04-31', To: '2026-05-10' },
      { ...base, From: '2026-03-01', To: '2026-03-31' },
    ])
    expect(sheet.errors.map(e => e.row)).toEqual([2, 3])
    expect(sheet.errors[0].message).toContain('real dates')
    expect(sheet.groups).toHaveLength(1)
    expect(sheet.groups[0].periods).toHaveLength(1)
  })
})
