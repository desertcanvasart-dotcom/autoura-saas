import { describe, it, expect } from 'vitest'
import {
  sanitizeSeasons,
  parseSeasons,
  seasonForTravelDate,
  overlappingSeasons,
  seasonGaps,
  seasonsFromAccommodationColumns,
  seasonsFromCruiseColumns,
  seasonsForRow,
  ratesForTravelDate,
  legacyColumnMirror,
  type RateSeason,
} from '../rates/rate-seasons'

// C3.2: unlimited dated rate periods. The defect being replaced is real —
// detectHotelSeason/detectCruiseSeason compared MONTH-DAY only, so a window
// entered for one contract year silently applied to every year after it.

const season = (name: string, from: string, to: string, ppd: number): RateSeason => ({
  name, from, to,
  rates: {
    ppd_eur: ppd, single_supplement_eur: 0, triple_reduction_eur: 0,
    ppd_non_eur: 0, single_supplement_non_eur: 0, triple_reduction_non_eur: 0,
  },
})

describe('sanitizeSeasons', () => {
  it('accepts a well-formed list, sorts by start date, defaults the name', () => {
    const out = sanitizeSeasons([
      { from: '2027-01-10', to: '2027-01-20', rates: { ppd_eur: 90 } },
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 150 } },
    ], 'accommodation')!
    expect(out.map(s => s.name)).toEqual(['Christmas', '2027-01-10 – 2027-01-20'])
    expect(out[0].rates.ppd_eur).toBe(150)
    // Every field of the vocabulary is present, blanks as 0.
    expect(out[0].rates.single_supplement_eur).toBe(0)
  })

  it('drops half-filled rows instead of failing the whole save', () => {
    const out = sanitizeSeasons([
      { from: '', to: '', rates: {} },
      { from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 150 } },
    ], 'accommodation')!
    expect(out).toHaveLength(1)
  })

  it('refuses an inverted window, and reads absent/garbage as "no periods"', () => {
    expect(sanitizeSeasons([{ from: '2027-01-05', to: '2026-12-20', rates: {} }], 'accommodation')).toBeNull()
    expect(sanitizeSeasons([], 'accommodation')).toBeNull()
    expect(sanitizeSeasons(null, 'accommodation')).toBeNull()
    expect(sanitizeSeasons('nonsense', 'accommodation')).toBeNull()
  })

  it('negative or non-numeric rates read as 0 (an unpriced hole, not a discount)', () => {
    const out = sanitizeSeasons([{ from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: -5, single_supplement_eur: 'x' } }], 'accommodation')!
    expect(out[0].rates.ppd_eur).toBe(0)
    expect(out[0].rates.single_supplement_eur).toBe(0)
  })

  it('parseSeasons tolerates JSONB arriving as a string', () => {
    const json = JSON.stringify([{ name: 'X', from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 10 } }])
    expect(parseSeasons(json, 'cruise')![0].rates.ppd_eur).toBe(10)
    expect(parseSeasons('{broken', 'cruise')).toBeNull()
  })
})

describe('seasonForTravelDate', () => {
  const christmas = season('Christmas', '2026-12-20', '2027-01-05', 150)
  const winter = season('Winter', '2026-10-01', '2027-04-30', 100)

  it('THE YEAR MATTERS — the same month-day in another year does not match', () => {
    expect(seasonForTravelDate([christmas], '2026-12-25')?.name).toBe('Christmas')
    // The defect this replaces: month-day matching would have priced this
    // departure at the 2026 contract's Christmas rate.
    expect(seasonForTravelDate([christmas], '2027-12-25')).toBeNull()
  })

  it('overlapping windows: the SHORTEST wins, reproducing peak-over-high', () => {
    expect(seasonForTravelDate([winter, christmas], '2026-12-25')?.name).toBe('Christmas')
    expect(seasonForTravelDate([christmas, winter], '2026-12-25')?.name).toBe('Christmas')
    expect(seasonForTravelDate([winter, christmas], '2027-02-01')?.name).toBe('Winter')
  })

  it('is inclusive at both ends and safe on junk input', () => {
    expect(seasonForTravelDate([christmas], '2026-12-20')?.name).toBe('Christmas')
    expect(seasonForTravelDate([christmas], '2027-01-05')?.name).toBe('Christmas')
    expect(seasonForTravelDate([christmas], '2027-01-06')).toBeNull()
    expect(seasonForTravelDate([christmas], null)).toBeNull()
    expect(seasonForTravelDate([christmas], 'garbage')).toBeNull()
    expect(seasonForTravelDate([], '2026-12-25')).toBeNull()
  })

  it('reads a timestamp as its date (no timezone shift at the boundary)', () => {
    expect(seasonForTravelDate([christmas], '2026-12-20T23:30:00Z')?.name).toBe('Christmas')
  })
})

describe('editor diagnostics', () => {
  it('reports overlapping pairs — legal, but also how a typo looks', () => {
    const list = [season('A', '2026-01-01', '2026-06-30', 1), season('B', '2026-06-01', '2026-12-31', 2)]
    expect(overlappingSeasons(list)).toEqual([[0, 1]])
    expect(overlappingSeasons([season('A', '2026-01-01', '2026-03-31', 1), season('B', '2026-04-01', '2026-06-30', 2)])).toEqual([])
  })

  it('reports uncovered gaps between periods', () => {
    const list = [season('A', '2026-01-01', '2026-03-31', 1), season('B', '2026-05-01', '2026-06-30', 2)]
    expect(seasonGaps(list)).toEqual([{ from: '2026-04-01', to: '2026-04-30' }])
    // Adjacent windows leave no gap.
    expect(seasonGaps([season('A', '2026-01-01', '2026-03-31', 1), season('B', '2026-04-01', '2026-06-30', 2)])).toEqual([])
  })
})

describe('legacy bridge — rows with no periods still price', () => {
  const hotelRow = {
    low_season_from: '2026-05-01', low_season_to: '2026-09-30',
    ppd_eur: 80, single_supplement_eur: 30, triple_reduction_eur: 10,
    high_season_from: '2026-10-01', high_season_to: '2027-04-30',
    high_season_ppd_eur: 120,
  }

  it('derives windows from the legacy columns, seasonal rates falling back to base', () => {
    const list = seasonsFromAccommodationColumns(hotelRow)
    expect(list.map(s => s.name)).toEqual(['Low Season', 'High Season'])
    expect(list[1].rates.ppd_eur).toBe(120)
    // high_season_single_supplement_eur is unset → base, mirroring the engine.
    expect(list[1].rates.single_supplement_eur).toBe(30)
  })

  it('unwraps a legacy window that wrapped into the next year', () => {
    const list = seasonsFromAccommodationColumns({
      high_season_from: '2026-10-01', high_season_to: '2026-04-30', high_season_ppd_eur: 120,
    })
    expect(list[0]).toMatchObject({ from: '2026-10-01', to: '2027-04-30' })
  })

  it('cruise rows use their own date column names', () => {
    const list = seasonsFromCruiseColumns({
      low_season_start: '2026-05-01', low_season_end: '2026-09-30', ppd_eur: 90,
      peak_season_1_start: '2026-12-20', peak_season_1_end: '2027-01-05', peak_season_ppd_eur: 200,
    })
    expect(list.map(s => s.name)).toEqual(['Low Season', 'Peak Season'])
    expect(list[1].rates.ppd_eur).toBe(200)
  })

  it('stored periods take precedence over the legacy columns', () => {
    const withSeasons = { ...hotelRow, seasons: [{ name: 'Contract', from: '2026-06-01', to: '2026-06-30', rates: { ppd_eur: 999 } }] }
    expect(seasonsForRow(withSeasons, 'accommodation')[0].name).toBe('Contract')
    expect(ratesForTravelDate(withSeasons, 'accommodation', '2026-06-15')!.rates.ppd_eur).toBe(999)
    // A date outside every period returns null so the caller uses base columns.
    expect(ratesForTravelDate(withSeasons, 'accommodation', '2026-08-01')).toBeNull()
  })

  it('a legacy row still resolves by date through the same lookup', () => {
    expect(ratesForTravelDate(hotelRow, 'accommodation', '2026-11-15')!.rates.ppd_eur).toBe(120)
    expect(ratesForTravelDate(hotelRow, 'accommodation', '2026-06-15')!.rates.ppd_eur).toBe(80)
  })
})

describe('legacyColumnMirror', () => {
  it('mirrors the FIRST period onto the base columns date-less readers use', () => {
    const list = sanitizeSeasons([
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05', rates: { ppd_eur: 150 } },
      { name: 'Summer', from: '2026-05-01', to: '2026-09-30', rates: { ppd_eur: 80 } },
    ], 'accommodation')!
    // Sorted, so Summer is first.
    const mirror = legacyColumnMirror(list, 'accommodation')
    expect(mirror).toMatchObject({ low_season_from: '2026-05-01', low_season_to: '2026-09-30', ppd_eur: 80 })
    const cruiseMirror = legacyColumnMirror(list, 'cruise')
    expect(cruiseMirror).toMatchObject({ low_season_start: '2026-05-01', low_season_end: '2026-09-30', ppd_eur: 80 })
  })

  it('no periods → nothing to mirror', () => {
    expect(legacyColumnMirror(null, 'accommodation')).toEqual({})
  })
})
