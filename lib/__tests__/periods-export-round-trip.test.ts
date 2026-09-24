// Operator, 2026-09-24: "Hotels are exported and shows only one date period,
// while actually each hotel has five periods." The periods now export as
// their own sheet, and re-importing the one-row-per-hotel sheet can no longer
// turn five periods into one.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { buildPeriodsSheetRows, periodsSheetHeaders, parsePeriodsCsv, detectPeriodsCsv, keepStoredPeriods } from '@/lib/rates/periods-csv'
import { sanitizeSeasons, seasonKey } from '@/lib/rates/rate-seasons'

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

const hotel = { service_code: 'ACC-ASW-WOV', property_name: 'Basma Aswan', city: 'Aswan', tier: 'standard', board_basis: 'bb', seasons: BASMA }

/** Export → CSV text → parse, as a browser round trip would. */
function roundTrip(rows: Array<Record<string, unknown>>) {
  const fields = periodsSheetHeaders('accommodation')
  const built = buildPeriodsSheetRows(rows, 'accommodation', 'service_code', 'property_name', k => LABELS[k] ?? k)
  const csv = Papa.unparse({ fields, data: built.map(r => fields.map(h => r[h] ?? '')) })
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  return { csv, built, parsed, sheet: parsePeriodsCsv(parsed.data) }
}

describe('Export periods', () => {
  it('writes every period, one row each — five, not one', () => {
    const { built } = roundTrip([hotel])
    expect(built).toHaveLength(5)
    expect(built.map(r => r['Period Name'])).toEqual(BASMA.map(p => p.name))
    expect(built[2]).toMatchObject({ 'Service Code': 'ACC-ASW-WOV', City: 'Aswan', Season: 'Christmas', From: '2026-12-21', To: '2026-12-26', 'PP Double (EU passport)': 130, 'Guide Bed / Night': 60 })
  })

  it('is the shape Import reads, and reads back to the same periods', () => {
    const { parsed, sheet } = roundTrip([hotel])
    expect(detectPeriodsCsv(parsed.meta.fields ?? [])).toBe(true)
    expect(sheet.errors).toEqual([])
    expect(sheet.groups).toHaveLength(1)
    expect(sheet.groups[0].service_code).toBe('ACC-ASW-WOV')
    // The route resolves the season WORD back to the key; seasonKey stands in.
    const back = sanitizeSeasons(sheet.groups[0].periods.map(p => ({ ...p, season: p.season ? seasonKey(p.season) : undefined })), 'accommodation')
    expect(back).toEqual(sanitizeSeasons(BASMA, 'accommodation'))
  })

  it('lists a hotel with no periods as one blank line, which Import skips (no error, no wipe)', () => {
    const { built, sheet } = roundTrip([hotel, { service_code: 'ACC-X', property_name: 'Unpriced Inn', seasons: [] }])
    expect(built).toHaveLength(6)
    expect(built[5]).toMatchObject({ 'Property Name': 'Unpriced Inn', From: '', To: '' })
    expect(sheet.errors).toEqual([])
    expect(sheet.groups.map(g => g.service_code)).toEqual(['ACC-ASW-WOV'])
  })

  it('cruises: Cruise Code / Ship Name / Guide Cabin headers, still read back', () => {
    const fields = periodsSheetHeaders('cruise')
    expect(fields.slice(0, 2)).toEqual(['Cruise Code', 'Ship Name'])
    expect(fields).toContain('Guide Cabin / Night')
    expect(detectPeriodsCsv(fields)).toBe(true)
  })
})

describe('re-importing the one-row-per-hotel sheet', () => {
  it('keeps all five stored periods instead of replacing them with the one the row holds', () => {
    const update: Record<string, unknown> = {
      seasons: [{ name: 'Contract rate', from: '2026-05-01', to: '2026-09-30', rates: rates(96, 80, 84, 69) }],
      ppd_eur: 96, city: 'Aswan',
    }
    const kept = keepStoredPeriods(update, BASMA, 'accommodation')
    expect(kept).toEqual({ kept: 5, incoming: 1 })
    expect(update).not.toHaveProperty('seasons') // the stored list is not rewritten at all
    expect(update).toMatchObject({ ppd_eur: 96, low_season_from: '2026-05-01', low_season_to: '2026-09-30', city: 'Aswan' })
  })

  it('a row with one stored period is still edited by the sheet, as before', () => {
    const one = [BASMA[0]]
    const update: Record<string, unknown> = { seasons: [{ ...BASMA[0], rates: rates(99, 80, 84, 69) }] }
    expect(keepStoredPeriods(update, one, 'accommodation')).toBeNull()
    expect((update.seasons as Array<{ rates: { ppd_eur: number } }>)[0].rates.ppd_eur).toBe(99)
  })

  it('a row with no stored periods takes what the sheet says', () => {
    const update: Record<string, unknown> = { seasons: [BASMA[0]] }
    expect(keepStoredPeriods(update, null, 'accommodation')).toBeNull()
  })
})
