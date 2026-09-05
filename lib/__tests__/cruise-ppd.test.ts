import { describe, it, expect } from 'vitest'
import { cruisePpdNightEur, cruisePpdNightNonEur, cruiseNightsOf } from '@/lib/rates/cruise-ppd'

// ============================================
// Cruise pricing basis: per person, PER NIGHT (locked 2026-09-05)
// ============================================
// A 3-night cruise multiplies by 3, a 4-night by 4 — so the per-night
// figure every surface hands out must really be per person per night. The
// grid used to expose the legacy whole-trip DOUBLE-CABIN rate as a
// day-slot price.

describe('cruisePpdNightEur', () => {
  it('the PPD model is already per person per night — used as-is', () => {
    expect(cruisePpdNightEur({ ppd_eur: 95, rate_double_eur: 999 })).toBe(95)
  })

  it('a legacy trip-cabin rate derives: cabin / 2 occupants / nights', () => {
    // EUR 840 double cabin for the whole 3-night trip = 140/person/night.
    expect(cruisePpdNightEur({ rate_double_eur: 840, duration_nights: 3 })).toBe(140)
    // Same cabin money over 4 nights = 105/person/night.
    expect(cruisePpdNightEur({ rate_double_eur: 840, duration_nights: 4 })).toBe(105)
  })

  it('rate_low_double_eur is the same legacy family', () => {
    expect(cruisePpdNightEur({ rate_low_double_eur: 600, duration_nights: 3 })).toBe(100)
  })

  it('nothing priced = 0, never a guess', () => {
    expect(cruisePpdNightEur({})).toBe(0)
  })

  it('missing duration uses the engine default of 4 nights', () => {
    expect(cruiseNightsOf({})).toBe(4)
    expect(cruisePpdNightEur({ rate_double_eur: 800 })).toBe(100)
  })
})

describe('cruisePpdNightNonEur', () => {
  it('derives from the non-EUR cabin rate when present', () => {
    expect(cruisePpdNightNonEur({ rate_double_non_eur: 900, duration_nights: 3 })).toBe(150)
  })

  it('falls back to the EUR figure (the standard non-EU mirror)', () => {
    expect(cruisePpdNightNonEur({ ppd_eur: 95 })).toBe(95)
  })
})
