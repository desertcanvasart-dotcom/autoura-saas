import { describe, it, expect } from 'vitest'
import { seasonForDate, computeUplift, type SeasonWindow } from '../pricing/season-uplift'

// C3.1: the operator's OWN demand premium — distinct from supplier
// seasonality, which is already inside the rate rows. The rules that matter:
// the departure date decides, overlapping windows take the HIGHEST premium
// (never the sum), and the premium never touches cost.

const NEW_YEAR: SeasonWindow = {
  seasonId: 'ny', name: 'New Year', upliftPercent: 20,
  startDate: '2026-12-26', endDate: '2027-01-05',
}
const WINTER_PEAK: SeasonWindow = {
  seasonId: 'wp', name: 'Winter peak', upliftPercent: 10,
  startDate: '2026-12-01', endDate: '2027-02-28',
}

describe('seasonForDate', () => {
  it('matches inclusively at both ends', () => {
    expect(seasonForDate([NEW_YEAR], '2026-12-26')?.name).toBe('New Year')
    expect(seasonForDate([NEW_YEAR], '2027-01-05')?.name).toBe('New Year')
    expect(seasonForDate([NEW_YEAR], '2026-12-25')).toBeNull()
    expect(seasonForDate([NEW_YEAR], '2027-01-06')).toBeNull()
  })

  it('overlapping windows: the HIGHEST premium wins, never the sum', () => {
    const match = seasonForDate([WINTER_PEAK, NEW_YEAR], '2026-12-31')
    expect(match?.name).toBe('New Year')
    expect(match?.upliftPercent).toBe(20) // not 30, and not 32.0 compounded
    // Order of the windows must not change the answer.
    expect(seasonForDate([NEW_YEAR, WINTER_PEAK], '2026-12-31')?.upliftPercent).toBe(20)
  })

  it('falls back to the broader season outside the narrow one', () => {
    expect(seasonForDate([WINTER_PEAK, NEW_YEAR], '2027-02-01')?.name).toBe('Winter peak')
  })

  it('no windows, no date, or a junk date → no season', () => {
    expect(seasonForDate([], '2026-12-31')).toBeNull()
    expect(seasonForDate([NEW_YEAR], null)).toBeNull()
    expect(seasonForDate([NEW_YEAR], 'not-a-date')).toBeNull()
    // A window with unusable dates is skipped, not crashed on.
    expect(seasonForDate([{ ...NEW_YEAR, startDate: 'x', endDate: 'y' }], '2026-12-31')).toBeNull()
  })

  it('reads a full timestamp as its date', () => {
    expect(seasonForDate([NEW_YEAR], '2026-12-31T22:00:00Z')?.name).toBe('New Year')
  })
})

describe('computeUplift', () => {
  it('charges the premium on the WHOLE selling price — a number checkable on paper', () => {
    const u = computeUplift({ sellingPrice: 408.75, season: { seasonId: 'ny', name: 'New Year', upliftPercent: 15 } })
    expect(u.amount).toBeCloseTo(61.31, 2)   // 408.75 × 0.15
    expect(408.75 + u.amount).toBeCloseTo(470.06, 2)
    expect(u.base).toBe(408.75)
    expect(u.seasonName).toBe('New Year')
  })

  it('an ordinary departure costs nothing extra', () => {
    const u = computeUplift({ sellingPrice: 1000, season: null })
    expect(u).toEqual({ amount: 0, base: 1000, percent: 0, seasonName: null })
  })

  it('a 0% season is a named watch-list, not a charge', () => {
    const u = computeUplift({ sellingPrice: 1000, season: { seasonId: 's', name: 'Watch', upliftPercent: 0 } })
    expect(u.amount).toBe(0)
    expect(u.seasonName).toBe('Watch')
  })

  it('never charges a premium on a negative price', () => {
    expect(computeUplift({ sellingPrice: -50, season: { seasonId: 's', name: 'X', upliftPercent: 20 } }).amount).toBe(0)
  })
})
