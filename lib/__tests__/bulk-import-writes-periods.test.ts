// The bulk rate import produces dated periods — always, when the row has a
// price and dates. The operator's sheets carry prices and Rate Valid From/To
// and no season windows: every one of the 166 live hotel and cruise rows
// arrived that way with NO period, was priced from its columns for any travel
// date, and had to be converted by migration 379. The import now does on the
// way in what 379 did afterwards.
import { describe, it, expect } from 'vitest'
import { applyCanonicalAliases, deriveImportSeasons, contractPeriodFromValidity } from '@/lib/bulk-rate-service'

const run = (table: string, record: Record<string, unknown>) => { applyCanonicalAliases(table, record); deriveImportSeasons(table, record); return record }

describe('a hotel row with prices and validity dates, and no season window', () => {
  it('gets ONE "Contract rate" period over its validity dates, at its per-night rates', () => {
    const r = run('accommodation_rates', { property_name: 'Basma Aswan', pp_double_eur: 105, single_supp_eur: 86, pp_double_non_eur: 120, rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30' })
    expect(r.seasons).toEqual([{ name: 'Contract rate', from: '2026-04-01', to: '2027-04-30', rates: {
      ppd_eur: 105, single_supplement_eur: 86, triple_reduction_eur: 0, ppd_non_eur: 120, single_supplement_non_eur: 86, triple_reduction_non_eur: 0, guide_rate_eur: 0 } }])
  })
  it('mirrors period 1 onto the base columns, as the form does', () => {
    const r = run('accommodation_rates', { pp_double_eur: 105, single_supp_eur: 86, rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30' })
    expect(r).toMatchObject({ ppd_eur: 105, single_supplement_eur: 86, low_season_from: '2026-04-01', low_season_to: '2027-04-30' })
  })
  it('a Date object in the date cells works too', () => {
    const r = run('accommodation_rates', { pp_double_eur: 105, rate_valid_from: new Date('2026-04-01T00:00:00Z'), rate_valid_to: new Date('2027-04-30T00:00:00Z') })
    expect((r.seasons as Array<{ from: string; to: string }>)[0]).toMatchObject({ from: '2026-04-01', to: '2027-04-30' })
  })
})

describe('a cruise row the same way', () => {
  it('per-trip prices become per-night ones for the stated nights, then the period', () => {
    const r = run('nile_cruises', { ship_name: 'MS Probe', duration_nights: 4, rate_low_double_eur: 480, rate_low_single_eur: 640, rate_valid_from: '2026-10-01', rate_valid_to: '2027-04-30' })
    expect(r.seasons).toEqual([{ name: 'Contract rate', from: '2026-10-01', to: '2027-04-30', rates: {
      ppd_eur: 120, single_supplement_eur: 40, triple_reduction_eur: 0, ppd_non_eur: 120, single_supplement_non_eur: 40, triple_reduction_non_eur: 0, guide_rate_eur: 0 } }])
    expect(r).toMatchObject({ low_season_start: '2026-10-01', low_season_end: '2027-04-30' })
  })
})

describe('when it does NOT make one', () => {
  it('no price: nothing — pricing reports the row', () => {
    expect(run('accommodation_rates', { rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30' }).seasons).toBeUndefined()
  })
  it('no dates, or dates the wrong way round: nothing', () => {
    expect(run('accommodation_rates', { pp_double_eur: 105 }).seasons).toBeUndefined()
    expect(contractPeriodFromValidity({ ppd_eur: 105, rate_valid_from: '2027-04-30', rate_valid_to: '2026-04-01' })).toEqual([])
  })
  it('a sheet WITH season windows keeps making those periods, not a contract one', () => {
    const r = run('accommodation_rates', { pp_double_eur: 100, high_pp_double_eur: 150, low_season_from: '2026-05-01', low_season_to: '2026-09-30', high_season_from: '2026-10-01', high_season_to: '2027-04-30', rate_valid_from: '2026-05-01', rate_valid_to: '2027-04-30' })
    expect((r.seasons as Array<{ name: string }>).map(s => s.name)).toEqual(['Low Season', 'High Season'])
  })
  it('a row that already carries periods is never touched', () => {
    const given = [{ name: 'Winter', from: '2026-11-01', to: '2027-02-28', rates: { ppd_eur: 90 } }]
    expect(run('accommodation_rates', { pp_double_eur: 105, rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30', seasons: given }).seasons).toBe(given)
  })
  it('other rate tables are left alone', () => {
    expect(run('guide_rates', { base_rate_eur: 40, rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30' }).seasons).toBeUndefined()
  })
})
