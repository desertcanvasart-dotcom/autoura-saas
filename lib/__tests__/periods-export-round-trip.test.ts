// Operator, 2026-09-24: "Hotels are exported and shows only one date period,
// while actually each hotel has five periods." Hotels and cruises now export
// ONE sheet — a row per period, the property's details on each — which
// Import reads back. And an older one-row-per-hotel file can no longer turn
// five periods into one.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { RATE_TABLE_CONFIGS, exportCellValue } from '@/lib/bulk-rate-service'
import { buildOneSheetRows, oneSheetHeaders, parseOneSheet, detectOneSheet, detailColumns, oneSheetTemplateRows } from '@/lib/rates/rate-sheet'
import { keepStoredPeriods } from '@/lib/rates/periods-csv'
import { sanitizeSeasons, seasonKey } from '@/lib/rates/rate-seasons'

const HOTELS = RATE_TABLE_CONFIGS.accommodation_rates
const CRUISES = RATE_TABLE_CONFIGS.nile_cruises

// Basma Aswan as stored live on 2026-09-24: five periods.
const rates = (ppd: number, single: number, ppdNon: number, singleNon: number) => ({
  ppd_eur: ppd, single_supplement_eur: single, triple_reduction_eur: 2,
  ppd_non_eur: ppdNon, single_supplement_non_eur: singleNon, triple_reduction_non_eur: 2, guide_rate_eur: 60,
})
const BASMA = [
  { name: 'Summer 2026', season: 'low_season', from: '2026-05-01', to: '2026-09-30', rates: rates(96, 80, 84, 69) },
  { name: 'Winter 2026/27', season: 'high_season', from: '2026-10-01', to: '2026-12-20', rates: rates(120, 100, 105, 86) },
  { name: 'Christmas 2026', season: 'christmas', from: '2026-12-21', to: '2026-12-26', rates: rates(130, 110, 115, 95) },
  { name: 'New Year', season: 'peak_season', from: '2026-12-27', to: '2027-01-03', rates: rates(150, 125, 132, 110) },
  { name: 'Winter 2026/27', season: 'high_season', from: '2027-01-04', to: '2027-04-30', rates: rates(125, 100, 105, 86) },
]
const LABELS: Record<string, string> = { low_season: 'Low Season', high_season: 'High Season', christmas: 'Christmas', peak_season: 'Peak Season' }

const basma = {
  id: '47dee0db', service_code: 'ACC-ASW-WOV', property_name: 'Basma Aswan', property_type: 'hotel', city: 'Aswan',
  board_basis: 'bb', tier: 'standard', supplier_name: 'South Sinai Hotels', rate_currency: 'USD',
  rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30', is_active: true,
  ppd_eur: 96, pp_double_eur: 96, low_season_from: '2026-05-01', seasons: BASMA,
}

/** Export → CSV text → parse, as a browser round trip would. */
function roundTrip(rows: Array<Record<string, unknown>>, config = HOTELS) {
  const fields = oneSheetHeaders(config)
  const built = buildOneSheetRows(rows, config, (r, c) => exportCellValue(config.tableName, r, c), k => LABELS[k] ?? k)
  const csv = Papa.unparse({ fields, data: built.map(r => fields.map(h => r[h] ?? '')) })
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  return { built, parsed, sheet: parseOneSheet(parsed.data, config) }
}

describe('the one hotel sheet — export', () => {
  it('a row per period, five for Basma, each carrying the hotel details', () => {
    const { built } = roundTrip([basma])
    expect(built).toHaveLength(5)
    expect(built.map(r => r.period_name)).toEqual(BASMA.map(p => p.name))
    for (const r of built) expect(r).toMatchObject({ service_code: 'ACC-ASW-WOV', property_name: 'Basma Aswan', city: 'Aswan', tier: 'standard', rate_currency: 'USD' })
    expect(built[2]).toMatchObject({ period_season: 'Christmas', period_from: '2026-12-21', period_to: '2026-12-26', period_pp_double_eur: 130, period_guide_rate_eur: 60 })
  })

  it('leaves out the old low/high/peak columns — the periods are those prices', () => {
    const cols = detailColumns(HOTELS)
    for (const gone of ['pp_double_eur', 'low_season_from', 'high_pp_double_eur', 'peak_season_2_to']) expect(cols).not.toContain(gone)
    for (const kept of ['service_code', 'property_name', 'supplier_name', 'rate_valid_from', 'contact_email', 'rate_currency', 'suite_rate_eur']) expect(cols).toContain(kept)
  })
})

describe('the one hotel sheet — import', () => {
  it('reads back to one hotel with the same details and the same five periods', () => {
    const { parsed, sheet } = roundTrip([basma])
    expect(detectOneSheet(parsed.meta.fields ?? [])).toBe(true)
    expect(sheet.errors).toEqual([])
    expect(sheet.groups).toHaveLength(1)
    expect(sheet.groups[0].details).toMatchObject({ service_code: 'ACC-ASW-WOV', city: 'Aswan', rate_currency: 'USD' })
    // The route resolves the season WORD back to the key; seasonKey stands in.
    const back = sanitizeSeasons(sheet.groups[0].periods.map(p => ({ ...p, season: p.season ? seasonKey(p.season) : undefined })), 'accommodation')
    expect(back).toEqual(sanitizeSeasons(BASMA, 'accommodation'))
  })

  it('a hotel with no periods is one row, read back with none (no error, no wipe)', () => {
    const { built, sheet } = roundTrip([basma, { service_code: 'ACC-X', property_name: 'Unpriced Inn', city: 'Luxor', seasons: [] }])
    expect(built).toHaveLength(6)
    expect(sheet.errors).toEqual([])
    expect(sheet.groups.map(g => [g.details.service_code, g.periods.length])).toEqual([['ACC-ASW-WOV', 5], ['ACC-X', 0]])
  })

  it('refuses a hotel whose rows disagree on a detail, naming both values', () => {
    const { parsed } = roundTrip([basma])
    parsed.data[3].city = 'Luxor'
    const sheet = parseOneSheet(parsed.data, HOTELS)
    expect(sheet.groups).toHaveLength(0)
    expect(sheet.errors[0]).toMatchObject({ row: 5, column: 'city' })
    expect(sheet.errors[0].message).toContain('"Aswan"')
  })

  it('a NEW hotel without a service code groups by its name', () => {
    const rows = [1, 2].map(n => ({ service_code: '', property_name: 'New Nile Hotel', city: 'Aswan', period_name: `P${n}`, period_from: `2026-0${n}-01`, period_to: `2026-0${n}-20`, period_pp_double_eur: '50' }))
    const sheet = parseOneSheet(rows as Array<Record<string, string>>, HOTELS)
    expect(sheet.errors).toEqual([])
    expect(sheet.groups).toHaveLength(1)
    expect(sheet.groups[0].periods).toHaveLength(2)
  })

  it('the sample is the same shape: one example hotel, two periods', () => {
    const rows = oneSheetTemplateRows(HOTELS, { service_code: 'EXAMPLE-DELETE-THIS-ROW', property_name: 'Example' })
    expect(rows).toHaveLength(2)
    expect(detectOneSheet(Object.keys(rows[0]))).toBe(true)
  })
})

describe('the one cruise sheet', () => {
  it('groups by cruise code and leaves out the old per-trip season prices', () => {
    const ship = { cruise_code: 'NC-1', ship_name: 'MS Nile', ship_category: 'deluxe', route_name: 'Luxor-Aswan', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: [4], seasons: BASMA.slice(0, 2) }
    const { built, sheet } = roundTrip([ship], CRUISES)
    expect(built).toHaveLength(2)
    expect(detailColumns(CRUISES)).not.toContain('rate_low_double_eur')
    expect(sheet.errors).toEqual([])
    expect(sheet.groups[0].periods).toHaveLength(2)
  })
})

describe('an OLDER one-row-per-hotel file', () => {
  it('keeps all five stored periods instead of replacing them with the one the row holds', () => {
    const update: Record<string, unknown> = {
      seasons: [{ name: 'Contract rate', from: '2026-05-01', to: '2026-09-30', rates: rates(96, 80, 84, 69) }],
      ppd_eur: 96, city: 'Aswan',
    }
    expect(keepStoredPeriods(update, BASMA, 'accommodation')).toEqual({ kept: 5, incoming: 1 })
    expect(update).not.toHaveProperty('seasons')
    expect(update).toMatchObject({ ppd_eur: 96, low_season_from: '2026-05-01', city: 'Aswan' })
  })

  it('a row with no more stored periods than it carries is edited as before', () => {
    const update: Record<string, unknown> = { seasons: [{ ...BASMA[0], rates: rates(99, 80, 84, 69) }] }
    expect(keepStoredPeriods(update, [BASMA[0]], 'accommodation')).toBeNull()
  })
})
