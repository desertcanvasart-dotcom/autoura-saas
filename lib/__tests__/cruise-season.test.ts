import { describe, it, expect } from 'vitest'
import { detectCruiseSeason } from '@/lib/auto-pricing-service'

// Season boundaries are compared by month/day (the stored year is ignored),
// so seasons recur annually. Peak season 2 wraps across the new year.
const SHIP = {
  high_season_start: '2026-10-01', high_season_end: '2026-11-30',
  peak_season_1_start: '2026-03-15', peak_season_1_end: '2026-04-30',
  peak_season_2_start: '2026-12-20', peak_season_2_end: '2027-01-05',
}

describe('detectCruiseSeason', () => {
  it('detects peak season 1 (spring)', () => {
    expect(detectCruiseSeason(SHIP, '2027-04-10')).toBe('peak')
  })

  it('detects high season', () => {
    expect(detectCruiseSeason(SHIP, '2026-10-20')).toBe('high')
  })

  it('detects wrap-around peak season 2 (late Dec and early Jan)', () => {
    expect(detectCruiseSeason(SHIP, '2026-12-28')).toBe('peak')
    expect(detectCruiseSeason(SHIP, '2027-01-03')).toBe('peak')
  })

  it('defaults to low season outside all ranges', () => {
    expect(detectCruiseSeason(SHIP, '2026-06-15')).toBe('low')
  })

  it('peak takes precedence over high when ranges overlap', () => {
    const overlap = { ...SHIP, high_season_start: '2026-03-01', high_season_end: '2026-05-31' }
    expect(detectCruiseSeason(overlap, '2026-04-10')).toBe('peak')
  })

  it('returns low for an invalid date or missing boundaries', () => {
    expect(detectCruiseSeason(SHIP, 'not-a-date')).toBe('low')
    expect(detectCruiseSeason({}, '2026-04-10')).toBe('low')
  })
})
