import { describe, it, expect } from 'vitest'
import { applyCanonicalAliases, exportCellValue, deriveImportSeasons } from '@/lib/bulk-rate-service'

// ============================================
// Cruise CSV ↔ engine conversion (per person, PER NIGHT — locked)
// ============================================
// The cruise CSV carries whole-trip PER-PERSON rates by occupancy; the
// engine and form use per-person PER-NIGHT figures. The bridge is
// arithmetic (PR #331 + the sibling's stated semantics — these columns
// were never per-cabin):
//   ppd/night = double_trip / nights;  supp = (single−double)/nights;
//   triple reduction = (double−triple)/nights.

describe('cruise import derivation', () => {
  it('a 3-night CSV row fills the per-night engine family: trip / 3', () => {
    const r: Record<string, unknown> = {
      duration_nights: 3,
      rate_low_double_eur: 840, rate_low_single_eur: 1140, rate_low_triple_eur: 780,
      rate_high_double_eur: 990,
    }
    applyCanonicalAliases('nile_cruises', r)
    expect(r.ppd_eur).toBe(280)              // 840 / 3
    expect(r.single_supplement_eur).toBe(100) // (1140−840) / 3
    expect(r.triple_reduction_eur).toBe(20)   // (840−780) / 3
    expect(r.high_season_ppd_eur).toBe(330)   // 990 / 3
  })

  it('a 4-night cruise divides by 4 — nights drive the basis', () => {
    const r: Record<string, unknown> = { duration_nights: 4, rate_low_double_eur: 840 }
    applyCanonicalAliases('nile_cruises', r)
    expect(r.ppd_eur).toBe(210)
  })

  it('never overwrites an explicit engine value', () => {
    const r: Record<string, unknown> = { duration_nights: 3, rate_low_double_eur: 840, ppd_eur: 275 }
    applyCanonicalAliases('nile_cruises', r)
    expect(r.ppd_eur).toBe(275)
  })

  it('dated windows become REAL named periods carrying the derived rates', () => {
    const r: Record<string, unknown> = {
      duration_nights: 3,
      low_season_start: '2026-05-01', low_season_end: '2026-09-30',
      rate_low_double_eur: 840,
      high_season_start: '2026-10-01', high_season_end: '2026-12-19',
      rate_high_double_eur: 990,
    }
    applyCanonicalAliases('nile_cruises', r)
    deriveImportSeasons('nile_cruises', r)
    const seasons = r.seasons as Array<{ name: string; rates: Record<string, number> }>
    expect(seasons.map(s => s.name)).toEqual(['Low Season', 'High Season'])
    expect(seasons[0].rates.ppd_eur).toBe(280)
    expect(seasons[1].rates.ppd_eur).toBe(330)
  })
})

describe('cruise export derivation', () => {
  const formCruise = {
    duration_nights: 3,
    ppd_eur: 280, single_supplement_eur: 100, triple_reduction_eur: 20,
    high_season_ppd_eur: 330,
  }

  it('a form-created cruise exports real whole-trip per-person numbers', () => {
    expect(exportCellValue('nile_cruises', formCruise, 'rate_low_double_eur')).toBe(840)
    expect(exportCellValue('nile_cruises', formCruise, 'rate_low_single_eur')).toBe(1140)
    expect(exportCellValue('nile_cruises', formCruise, 'rate_low_triple_eur')).toBe(780)
    expect(exportCellValue('nile_cruises', formCruise, 'rate_high_double_eur')).toBe(990)
  })

  it('a directly populated CSV cell wins over derivation', () => {
    expect(
      exportCellValue('nile_cruises', { ...formCruise, rate_low_double_eur: 850 }, 'rate_low_double_eur')
    ).toBe(850)
  })

  it('an unpriced season derives nothing — empty cell, never a guess', () => {
    expect(exportCellValue('nile_cruises', formCruise, 'rate_peak_double_eur') ?? '').toBe('')
  })

  it('suites pass through untouched (no engine equivalent)', () => {
    expect(exportCellValue('nile_cruises', { rate_low_suite_eur: 500 }, 'rate_low_suite_eur')).toBe(500)
  })
})
