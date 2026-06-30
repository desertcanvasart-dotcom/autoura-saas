import { describe, it, expect } from 'vitest'
import {
  calculateExpectedDays,
  normalizeTier,
  isValidDate,
  type ExtractedDay,
} from '../ai/parsing-utils'

// Minimal ExtractedDay factory — only day_number matters for calculateExpectedDays
function day(day_number: number): ExtractedDay {
  return {
    day_number,
    date: null,
    date_display: null,
    title: '',
    city: null,
    is_arrival: false,
    is_departure: false,
    is_transfer_only: false,
    is_free_day: false,
    activities: [],
    attractions: [],
    meals_included: { breakfast: false, lunch: false, dinner: false },
    guide_required: false,
    transport_type: null,
    flight_info: null,
    hotel_name: null,
    overnight_city: '',
    notes: null,
  }
}

describe('calculateExpectedDays', () => {
  it('counts the highest day marker (D1 ... D5)', () => {
    expect(calculateExpectedDays('D1 CAI\nD2 CAI\nD5 LXR', null)).toBe(5)
  })

  it('sums NTS patterns and adds one (2NTS CAI + 3NTS CRZ = 6 days)', () => {
    expect(calculateExpectedDays('2NTS CAI + 3NTS CRZ', null)).toBe(6)
  })

  it('uses extracted_days array length when longer', () => {
    expect(calculateExpectedDays('', [day(1), day(2), day(3)])).toBe(3)
  })

  it('takes the maximum across all methods', () => {
    // markers max=2, nights 1+1 -> 3 days, extracted length 4 -> 4 wins
    expect(
      calculateExpectedDays('D1 + D2, 1NTS CAI + 1NTS CRZ', [day(1), day(2), day(3), day(4)])
    ).toBe(4)
  })

  it('defaults to 1 when nothing is found', () => {
    expect(calculateExpectedDays('', null)).toBe(1)
  })
})

describe('normalizeTier', () => {
  it("maps 'economy' to 'budget'", () => {
    expect(normalizeTier('economy')).toBe('budget')
  })

  it("returns 'standard' for null/undefined", () => {
    expect(normalizeTier(null)).toBe('standard')
    expect(normalizeTier(undefined)).toBe('standard')
  })

  it('maps known synonyms and falls back to standard for unknown', () => {
    expect(normalizeTier('premium')).toBe('luxury')
    expect(normalizeTier('superior')).toBe('deluxe')
    expect(normalizeTier('something-unknown')).toBe('standard')
  })
})

describe('isValidDate', () => {
  it('accepts a valid ISO date', () => {
    expect(isValidDate('2026-06-30')).toBe(true)
  })

  it('rejects null/undefined/empty', () => {
    expect(isValidDate(null)).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
    expect(isValidDate('')).toBe(false)
  })

  it('rejects garbage strings', () => {
    expect(isValidDate('not-a-date')).toBe(false)
  })
})
