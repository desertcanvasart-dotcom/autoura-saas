import { describe, it, expect } from 'vitest'
import { detectHotelSeason } from '@/lib/auto-pricing-service'

// Season boundaries are compared by month/day (the stored year is ignored),
// so seasons recur annually. Peak season 2 wraps across the new year.
// Column names come from migration 103 (accommodation_rates).
const HOTEL = {
  high_season_from: '2026-10-01', high_season_to: '2026-11-30',
  peak_season_from: '2026-03-15', peak_season_to: '2026-04-30',
  peak_season_2_from: '2026-12-20', peak_season_2_to: '2027-01-05',
}

describe('detectHotelSeason', () => {
  it('detects peak season (spring)', () => {
    expect(detectHotelSeason(HOTEL, '2027-04-10')).toBe('peak')
  })

  it('detects high season', () => {
    expect(detectHotelSeason(HOTEL, '2026-10-20')).toBe('high')
  })

  it('detects wrap-around peak season 2 (late Dec and early Jan)', () => {
    expect(detectHotelSeason(HOTEL, '2026-12-28')).toBe('peak')
    expect(detectHotelSeason(HOTEL, '2027-01-03')).toBe('peak')
  })

  it('defaults to low season outside all ranges', () => {
    expect(detectHotelSeason(HOTEL, '2026-06-15')).toBe('low')
  })

  it('peak takes precedence over high when ranges overlap', () => {
    const overlap = { ...HOTEL, high_season_from: '2026-03-01', high_season_to: '2026-05-31' }
    expect(detectHotelSeason(overlap, '2026-04-10')).toBe('peak')
  })

  it('returns low for an invalid date or missing boundaries', () => {
    expect(detectHotelSeason(HOTEL, 'not-a-date')).toBe('low')
    expect(detectHotelSeason({}, '2026-04-10')).toBe('low')
  })
})
