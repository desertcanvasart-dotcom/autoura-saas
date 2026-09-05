import { describe, it, expect } from 'vitest'
import {
  CANONICAL_COLUMN_ALIASES,
  applyCanonicalAliases,
  exportCellValue,
  deriveImportSeasons,
} from '@/lib/bulk-rate-service'
import { RATE_MONETARY_COLUMNS } from '@/lib/rates/rate-currency'

// ============================================
// Accommodation split-brain healing (found by a real sibling-app import)
// ============================================
// The engine reads ppd_eur; the bulk CSV writes pp_double_eur. Migration
// 220 mirrored once — a hotel imported after it priced at 0 and opened
// blank, and a form-created hotel exported blank cells. The bulk boundary
// now fills BOTH families, exports read either, and dated season columns
// become real periods.

describe('applyCanonicalAliases', () => {
  it('an imported (importer-family) row fills the engine family', () => {
    const r: Record<string, unknown> = { pp_double_eur: 150, high_pp_double_eur: 190 }
    applyCanonicalAliases('accommodation_rates', r)
    expect(r.ppd_eur).toBe(150)
    expect(r.high_season_ppd_eur).toBe(190)
  })

  it('a form-family record fills the importer family (grid readers)', () => {
    const r: Record<string, unknown> = { ppd_eur: 120, peak_season_single_supplement_eur: 35 }
    applyCanonicalAliases('accommodation_rates', r)
    expect(r.pp_double_eur).toBe(120)
    expect(r.peak_single_supp_eur).toBe(35)
  })

  it('never overwrites an explicit value on either side', () => {
    const r: Record<string, unknown> = { pp_double_eur: 150, ppd_eur: 145 }
    applyCanonicalAliases('accommodation_rates', r)
    expect(r.ppd_eur).toBe(145)
    expect(r.pp_double_eur).toBe(150)
  })

  it('tables with no aliases are untouched (cruises convert — see bulk-cruise-conversion.test)', () => {
    const r: Record<string, unknown> = { daily_rate: 100 }
    applyCanonicalAliases('guides', r)
    expect(r).toEqual({ daily_rate: 100 })
  })

  it('every aliased column is a known monetary column (no typos either side)', () => {
    const known = new Set(RATE_MONETARY_COLUMNS.accommodation_rates)
    for (const [importer, engine] of Object.entries(CANONICAL_COLUMN_ALIASES.accommodation_rates)) {
      expect(known.has(importer), `${importer} not in RATE_MONETARY_COLUMNS`).toBe(true)
      expect(known.has(engine), `${engine} not in RATE_MONETARY_COLUMNS`).toBe(true)
    }
  })
})

describe('exportCellValue', () => {
  it('a form-created hotel (engine family only) exports real numbers', () => {
    const row = { ppd_eur: 120, pp_double_eur: null }
    expect(exportCellValue('accommodation_rates', row, 'pp_double_eur')).toBe(120)
  })

  it('a directly populated cell wins over its partner', () => {
    const row = { ppd_eur: 120, pp_double_eur: 150 }
    expect(exportCellValue('accommodation_rates', row, 'pp_double_eur')).toBe(150)
  })

  it('non-aliased columns pass through untouched', () => {
    expect(exportCellValue('accommodation_rates', { city: 'Cairo' }, 'city')).toBe('Cairo')
  })
})

describe('deriveImportSeasons', () => {
  it('a file with dated season columns lands as REAL named periods', () => {
    const r: Record<string, unknown> = {
      ppd_eur: 120, single_supplement_eur: 40, triple_reduction_eur: 15,
      ppd_non_eur: 130, single_supplement_non_eur: 45, triple_reduction_non_eur: 18,
      high_season_ppd_eur: 160,
      low_season_from: '2026-05-01', low_season_to: '2026-09-30',
      high_season_from: '2026-10-01', high_season_to: '2026-12-19',
    }
    applyCanonicalAliases('accommodation_rates', r)
    deriveImportSeasons('accommodation_rates', r)
    const seasons = r.seasons as Array<{ name: string; rates: Record<string, number> }>
    expect(seasons.map(s => s.name)).toEqual(['Low Season', 'High Season'])
    expect(seasons[0].rates.ppd_eur).toBe(120)
    expect(seasons[1].rates.ppd_eur).toBe(160)
  })

  it('a file with no dated windows stays a base-rate-only row', () => {
    const r: Record<string, unknown> = { ppd_eur: 120 }
    deriveImportSeasons('accommodation_rates', r)
    expect(r.seasons).toBeUndefined()
  })

  it('never replaces seasons the record already carries', () => {
    const r: Record<string, unknown> = { seasons: [{ name: 'Kept', from: 'a', to: 'b', rates: {} }], low_season_from: '2026-01-01', low_season_to: '2026-02-01', ppd_eur: 9 }
    deriveImportSeasons('accommodation_rates', r)
    expect((r.seasons as Array<{ name: string }>)[0].name).toBe('Kept')
  })
})
