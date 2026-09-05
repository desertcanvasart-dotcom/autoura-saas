import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { detectPeriodsCsv, parsePeriodsCsv } from '@/lib/rates/periods-csv'

// ============================================
// Periods-format rate sheet (one row per contract period)
// ============================================
// The exact file that bounced 9/9 with "Property Name is required": the
// flat importer read label-headers it didn't know. The periods importer
// must accept precisely that shape — grouped by property, named periods,
// guide bed included — and refuse only what is genuinely broken.

// The user's real file, verbatim shape.
const REAL_FILE = `Service Code,Property Name,Period Name,From,To,PP Double (EU passport),Single Supp (EU passport),Triple Red (EU passport),PP Double (non-EU passport),Single Supp (non-EU passport),Triple Red (non-EU passport),Guide Bed / Night
ACC-HUR-CND,Grand Azur Horizon,Summer 2026,2026-05-01,2026-10-31,100,85,10,100,85,10,3000
ACC-HUR-CND,Grand Azur Horizon,Winter 2026/2027,2026-11-01,2026-12-20,120,100,10,120,100,10,0
ACC-HUR-CND,Grand Azur Horizon,Christmas,2026-12-21,2026-12-26,150,125,10,160,135,10,0
ACC-HUR-CND,Grand Azur Horizon,New Year,2026-12-27,2027-01-03,200,165,10,210,175,10,0
ACC-ASW-37R,Mövenpick Aswan,2026-09-01 – 2026-12-31,2026-09-01,2026-12-31,170,150,10,170,150,10,3000`

const parse = (csv: string) =>
  Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })

describe('detectPeriodsCsv', () => {
  it('recognises the periods shape', () => {
    const p = parse(REAL_FILE)
    expect(detectPeriodsCsv(p.meta.fields ?? [])).toBe(true)
  })

  it('never mistakes the flat bulk format for periods', () => {
    expect(detectPeriodsCsv(['property_name', 'pp_double_eur', 'low_season_from', 'low_season_to'])).toBe(false)
  })
})

describe('parsePeriodsCsv — the real failing file', () => {
  const sheet = parsePeriodsCsv(parse(REAL_FILE).data)

  it('every row parses — zero refusals', () => {
    expect(sheet.errors).toEqual([])
    expect(sheet.totalRows).toBe(5)
  })

  it('rows group by property: 4 periods for the first hotel, 1 for the second', () => {
    expect(sheet.groups).toHaveLength(2)
    const [azur, aswan] = sheet.groups
    expect(azur.service_code).toBe('ACC-HUR-CND')
    expect(azur.periods.map(p => p.name)).toEqual(['Summer 2026', 'Winter 2026/2027', 'Christmas', 'New Year'])
    expect(aswan.periods).toHaveLength(1)
  })

  it('rates land on the period, guide bed included, non-EU respected', () => {
    const christmas = sheet.groups[0].periods[2]
    expect(christmas.rates.ppd_eur).toBe(150)
    expect(christmas.rates.ppd_non_eur).toBe(160)
    expect(christmas.rates.single_supplement_non_eur).toBe(135)
    expect(sheet.groups[0].periods[0].rates.guide_rate_eur).toBe(3000)
  })

  it('a nameless period is named by its dates', () => {
    expect(sheet.groups[1].periods[0].name).toBe('2026-09-01 – 2026-12-31')
  })
})

describe('parsePeriodsCsv — refusals name the problem', () => {
  it('no identity at all', () => {
    const sheet = parsePeriodsCsv(parse('Property Name,From,To,PP Double\n,2026-01-01,2026-02-01,100').data)
    expect(sheet.errors[0].message).toMatch(/neither a Service Code nor a Property Name/)
  })

  it('a period ending before it starts', () => {
    const sheet = parsePeriodsCsv(parse('Property Name,From,To,PP Double\nNile Star,2026-02-01,2026-01-01,100').data)
    expect(sheet.errors[0].message).toMatch(/ends \(2026-01-01\) before it starts/)
  })

  it('a non-date From', () => {
    const sheet = parsePeriodsCsv(parse('Property Name,From,To,PP Double\nNile Star,May,2026-02-01,100').data)
    expect(sheet.errors[0].message).toMatch(/must be real dates/)
  })

  it('a seventh period for one property trips the cap', () => {
    const rows = ['Property Name,From,To,PP Double']
    for (let m = 1; m <= 7; m++) {
      rows.push(`Nile Star,2026-0${m}-01,2026-0${m}-28,10${m}`)
    }
    const sheet = parsePeriodsCsv(parse(rows.join('\n')).data)
    expect(sheet.groups[0].periods).toHaveLength(6)
    expect(sheet.errors[0].message).toMatch(/caps at 6/)
  })

  it('blank non-EU columns mirror the EU figures', () => {
    const sheet = parsePeriodsCsv(parse('Property Name,From,To,PP Double,Single Supp\nNile Star,2026-01-01,2026-02-01,100,40').data)
    expect(sheet.groups[0].periods[0].rates.ppd_non_eur).toBe(100)
    expect(sheet.groups[0].periods[0].rates.single_supplement_non_eur).toBe(40)
  })
})
