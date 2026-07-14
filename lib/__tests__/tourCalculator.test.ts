import { describe, it, expect } from 'vitest'
import {
  calculateTourPricing,
  suggestVehicleType,
  getMealsIncluded,
  formatCurrency,
  calculatePercentage,
  validateTour,
  generateTourCode,
} from '@/lib/tourCalculator'
import type {
  Tour,
  TourDay,
  AccommodationRate,
  MealRate,
  GuideRate,
  EntranceRate,
  TransportationRate,
} from '@/app/tour-builder/types'

// Complements lib/__tests__/tour-calculator.test.ts (the Layer-0 golden
// master). This file focuses on the harness policy: MISSING or PARTIAL rate
// data must never be silently replaced by a guessed number — it prices at 0
// AND records a hole so `complete` flips to false. It also locks per-person
// vs per-group scaling, the additional-services rate_type branches, and the
// pure helpers.

// ---------------------------------------------------------------------------
// Minimal builders. Rates are intentionally overridable with null/undefined
// so we can simulate partial DB rows; the loose shape is cast back to the
// strict rate types the calculator expects at its boundary.
// ---------------------------------------------------------------------------

type LooseRates = {
  base_rate_eur?: number | null
  base_rate_non_eur?: number | null
}

function accommodation(rates: LooseRates): AccommodationRate {
  return {
    id: 'acc-1',
    service_code: 'ACC-TEST',
    property_name: 'Test Hotel',
    property_type: 'hotel',
    star_rating: 4,
    room_type: 'double',
    board_basis: 'BB',
    city: 'Cairo',
    tier: 'standard',
    ...rates,
  } as AccommodationRate
}

function meal(rates: LooseRates, mealType: 'Lunch' | 'Dinner' = 'Lunch'): MealRate {
  return {
    id: `meal-${mealType}`,
    service_code: 'MEAL-TEST',
    restaurant_name: 'Test Restaurant',
    meal_type: mealType,
    cuisine_type: 'local',
    restaurant_type: 'casual',
    city: 'Cairo',
    tier: 'standard',
    meal_category: 'set-menu',
    ...rates,
  } as MealRate
}

function guide(rates: LooseRates): GuideRate {
  return {
    id: 'guide-1',
    service_code: 'GUIDE-TEST',
    guide_language: 'English',
    guide_type: 'Egyptologist',
    city: 'Cairo',
    tour_duration: 'full-day',
    ...rates,
  } as GuideRate
}

function entrance(rates: LooseRates & { eur_rate?: number | null; non_eur_rate?: number | null }): EntranceRate {
  return {
    id: 'ent-1',
    service_code: 'ENT-TEST',
    attraction_name: 'Test Museum',
    city: 'Cairo',
    fee_type: 'standard',
    ...rates,
  } as EntranceRate
}

function transportation(rates: LooseRates): TransportationRate {
  return {
    id: 'trans-1',
    service_code: 'TRANS-TEST',
    service_type: 'transfer',
    vehicle_type: 'Minivan',
    capacity_min: 1,
    capacity_max: 8,
    city: 'Cairo',
    ...rates,
  } as TransportationRate
}

function day(partial: Partial<TourDay> & Record<string, unknown> = {}): TourDay {
  return {
    day_number: 1,
    city: 'Cairo',
    breakfast_included: true,
    guide_required: false,
    ...partial,
  } as TourDay
}

function tour(days: TourDay[]): Tour {
  return {
    tour_code: 'TOUR-TEST',
    tour_name: 'Test Tour',
    duration_days: days.length,
    cities: ['Cairo'],
    tour_type: 'classic',
    is_template: false,
    days,
  }
}

type ServiceEntry = {
  service: {
    name?: string
    service_name?: string
    rate_type?: string
    base_rate_eur?: number | null
    base_rate_non_eur?: number | null
  }
  quantity?: number
}

function dayWithServices(services: ServiceEntry[], partial: Partial<TourDay> = {}): TourDay {
  return day({ ...partial, additional_services: services })
}

// ---------------------------------------------------------------------------
// Missing / partial rate data — the holes policy
// ---------------------------------------------------------------------------

describe('calculateTourPricing — missing rates surface as holes, never guesses', () => {
  it('null accommodation rate prices at 0 and records a hole', () => {
    const t = tour([day({ accommodation: accommodation({ base_rate_eur: null, base_rate_non_eur: 100 }) })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_accommodation).toBe(0)
    expect(r.totals.grand_total).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes).toHaveLength(1)
    expect(r.holes?.[0]).toContain('day 1')
    expect(r.holes?.[0]).toContain('accommodation')
    expect(r.holes?.[0]).toContain('EUR')
  })

  it('a rate present for EUR but missing for non-EUR only holes the non-EUR run', () => {
    const t = tour([day({ accommodation: accommodation({ base_rate_eur: 80, base_rate_non_eur: undefined }) })])
    const eur = calculateTourPricing(t, 2, true)
    const nonEur = calculateTourPricing(t, 2, false)
    expect(eur.complete).toBe(true)
    expect(eur.totals.total_accommodation).toBe(80)
    expect(nonEur.complete).toBe(false)
    expect(nonEur.totals.total_accommodation).toBe(0)
    expect(nonEur.holes?.[0]).toContain('non-EUR')
  })

  it('missing lunch rate holes lunch but still prices dinner', () => {
    const t = tour([
      day({
        lunch_meal: meal({ base_rate_eur: undefined, base_rate_non_eur: 15 }, 'Lunch'),
        dinner_meal: meal({ base_rate_eur: 20, base_rate_non_eur: 25 }, 'Dinner'),
      }),
    ])
    const r = calculateTourPricing(t, 3, true)
    expect(r.totals.total_meals).toBe(3 * 20) // dinner only
    expect(r.complete).toBe(false)
    expect(r.holes).toHaveLength(1)
    expect(r.holes?.[0]).toContain('lunch')
  })

  it('NaN rate is treated as missing (hole, not NaN in totals)', () => {
    const t = tour([day({ lunch_meal: meal({ base_rate_eur: Number.NaN, base_rate_non_eur: 15 }) })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_meals).toBe(0)
    expect(Number.isNaN(r.totals.grand_total)).toBe(false)
    expect(r.complete).toBe(false)
  })

  it('negative rate never produces a negative total — it is a hole', () => {
    const t = tour([day({ lunch_meal: meal({ base_rate_eur: -12, base_rate_non_eur: 15 }) })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_meals).toBe(0)
    expect(r.totals.grand_total).toBe(0)
    expect(r.complete).toBe(false)
  })

  // NOTE: rateOrHole treats rate <= 0 as missing, so a genuinely FREE
  // (0-priced) entrance cannot be represented — it is flagged as a hole.
  // Current observed behavior; conservative side of the no-fabrication policy.
  it('a 0 rate is treated as a hole (free items cannot be represented)', () => {
    const t = tour([day({ activities: [{ activity_order: 1, entrance: entrance({ base_rate_eur: 0, base_rate_non_eur: 0 }) }] })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_entrances).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes).toHaveLength(1)
  })

  it('guide required but none selected records a hole with 0 cost', () => {
    const t = tour([day({ guide_required: true })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_guides).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes?.[0]).toBe('day 1: guide required but none selected')
  })

  // A guide object attached while guide_required=false is deliberately NOT
  // priced and NOT holed (the flag is the source of truth for whether the
  // component is part of the tour). Locked as current behavior.
  it('guide present but not required prices at 0 with no hole', () => {
    const t = tour([day({ guide_required: false, guide: guide({ base_rate_eur: 150, base_rate_non_eur: 150 }) })])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_guides).toBe(0)
    expect(r.complete).toBe(true)
    expect(r.holes).toEqual([])
  })

  it('an entirely empty day (nothing booked) is complete with 0 total — absence is not a hole', () => {
    const r = calculateTourPricing(tour([day()]), 4, true)
    expect(r.totals.grand_total).toBe(0)
    expect(r.complete).toBe(true)
    expect(r.holes).toEqual([])
  })

  it('holes accumulate across days and priced components still total correctly', () => {
    const t = tour([
      day({ day_number: 1, accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }) }),
      day({ day_number: 2, guide_required: true, lunch_meal: meal({ base_rate_eur: null, base_rate_non_eur: 10 }) }),
    ])
    const r = calculateTourPricing(t, 2, true)
    expect(r.holes).toHaveLength(2) // missing guide + missing lunch rate
    expect(r.totals.grand_total).toBe(100) // only the priced accommodation
    expect(r.complete).toBe(false)
  })

  it('entrance rate falls back from eur_rate to base_rate_eur column naming', () => {
    const viaAlt = tour([day({ activities: [{ activity_order: 1, entrance: entrance({ eur_rate: 30, non_eur_rate: 35 }) }] })])
    const viaBase = tour([day({ activities: [{ activity_order: 1, entrance: entrance({ base_rate_eur: 30, base_rate_non_eur: 35 }) }] })])
    expect(calculateTourPricing(viaAlt, 2, true).totals.total_entrances).toBe(60)
    expect(calculateTourPricing(viaBase, 2, true).totals.total_entrances).toBe(60)
    expect(calculateTourPricing(viaAlt, 2, false).totals.total_entrances).toBe(70)
  })
})

// ---------------------------------------------------------------------------
// Per-person vs per-group scaling
// ---------------------------------------------------------------------------

describe('calculateTourPricing — per-person vs per-group scaling', () => {
  const fullDay = day({
    accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }), // per ROOM (2 pax)
    lunch_meal: meal({ base_rate_eur: 10, base_rate_non_eur: 12 }, 'Lunch'), // per person
    dinner_meal: meal({ base_rate_eur: 20, base_rate_non_eur: 24 }, 'Dinner'), // per person
    guide_required: true,
    guide: guide({ base_rate_eur: 150, base_rate_non_eur: 150 }), // per group
    activities: [
      {
        activity_order: 1,
        entrance: entrance({ base_rate_eur: 15, base_rate_non_eur: 18 }), // per person
        transportation: transportation({ base_rate_eur: 80, base_rate_non_eur: 90 }), // per group
      },
    ],
  })

  it('prices 1 pax correctly across all component kinds', () => {
    const r = calculateTourPricing(tour([fullDay]), 1, true)
    expect(r.totals.total_accommodation).toBe(100) // 1 room
    expect(r.totals.total_meals).toBe(30)
    expect(r.totals.total_guides).toBe(150)
    expect(r.totals.total_entrances).toBe(15)
    expect(r.totals.total_transportation).toBe(80)
    expect(r.totals.grand_total).toBe(375)
    expect(r.complete).toBe(true)
  })

  it('scales only per-person components when pax quadruples', () => {
    const r1 = calculateTourPricing(tour([fullDay]), 1, true)
    const r4 = calculateTourPricing(tour([fullDay]), 4, true)
    expect(r4.totals.total_meals).toBe(4 * r1.totals.total_meals)
    expect(r4.totals.total_entrances).toBe(4 * r1.totals.total_entrances)
    expect(r4.totals.total_guides).toBe(r1.totals.total_guides) // per group, unchanged
    expect(r4.totals.total_transportation).toBe(r1.totals.total_transportation) // per group, unchanged
    expect(r4.totals.total_accommodation).toBe(200) // ceil(4/2) = 2 rooms
  })

  it('odd pax pays for the half-empty room (ceil(pax/2))', () => {
    const t = tour([day({ accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }) })])
    expect(calculateTourPricing(t, 7, true).totals.total_accommodation).toBe(400) // 4 rooms
    expect(calculateTourPricing(t, 8, true).totals.total_accommodation).toBe(400) // still 4 rooms
  })
})

// ---------------------------------------------------------------------------
// Additional services rate_type branches
// ---------------------------------------------------------------------------

describe('calculateTourPricing — additional services rate types', () => {
  const svc = (rate_type: string, rate = 10, name = 'Test Service') => ({
    service: { name, rate_type, base_rate_eur: rate, base_rate_non_eur: rate + 5 },
  })

  it('per_person multiplies by pax', () => {
    const r = calculateTourPricing(tour([dayWithServices([svc('per_person')])]), 6, true)
    expect(r.totals.total_additional_services).toBe(60)
  })

  it('per_group and per_day charge a flat rate regardless of pax', () => {
    const r = calculateTourPricing(
      tour([dayWithServices([svc('per_group', 40), svc('per_day', 25)])]),
      10,
      true
    )
    expect(r.totals.total_additional_services).toBe(65)
  })

  it('per_vehicle multiplies by quantity, defaulting to 1 when quantity missing', () => {
    const withQty = { ...svc('per_vehicle', 30), quantity: 3 }
    const noQty = svc('per_vehicle', 30)
    expect(
      calculateTourPricing(tour([dayWithServices([withQty])]), 2, true).totals.total_additional_services
    ).toBe(90)
    expect(
      calculateTourPricing(tour([dayWithServices([noQty])]), 2, true).totals.total_additional_services
    ).toBe(30)
  })

  it('missing service rate records a hole naming the service', () => {
    const r = calculateTourPricing(
      tour([dayWithServices([{ service: { name: 'Camel Ride', rate_type: 'per_person', base_rate_eur: null } }])]),
      2,
      true
    )
    expect(r.totals.total_additional_services).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes?.[0]).toContain('Camel Ride')
  })

  it('non-EUR run uses the non-EUR service rate', () => {
    const r = calculateTourPricing(tour([dayWithServices([svc('per_person', 10)])]), 2, false)
    expect(r.totals.total_additional_services).toBe(30) // 2 × (10 + 5)
  })

  // A service with a VALID rate but an unrecognized rate_type is still not
  // counted (there is no defined way to multiply it), but it surfaces as a
  // hole so the breakdown can never claim completeness while silently
  // dropping a real cost.
  it('unknown rate_type contributes 0 AND records a hole (never a silent under-price)', () => {
    const r = calculateTourPricing(
      tour([dayWithServices([{ service: { name: 'Mystery', rate_type: 'per_booking', base_rate_eur: 50, base_rate_non_eur: 50 } }])]),
      2,
      true
    )
    expect(r.totals.total_additional_services).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes).toEqual([
      'day 1: service "Mystery" has unknown rate_type "per_booking" — cost not counted',
    ])
  })
})

// ---------------------------------------------------------------------------
// Day boundaries, empty itinerary, rounding
// ---------------------------------------------------------------------------

describe('calculateTourPricing — day boundaries, empty itinerary, rounding', () => {
  it('checkout day without accommodation contributes 0 nights and no hole', () => {
    const t = tour([
      day({ day_number: 1, accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }) }),
      day({ day_number: 2 }), // departure day: no hotel booked
    ])
    const r = calculateTourPricing(t, 2, true)
    expect(r.totals.total_accommodation).toBe(100)
    expect(r.daily_breakdown).toHaveLength(2)
    expect(r.daily_breakdown[1].daily_total).toBe(0)
    expect(r.complete).toBe(true)
  })

  it('throws on an empty itinerary (days: []) and on undefined days', () => {
    expect(() => calculateTourPricing(tour([]), 2, true)).toThrow('at least one day')
    expect(() => calculateTourPricing({ ...tour([day()]), days: undefined }, 2, true)).toThrow()
  })

  it('throws on zero or negative pax', () => {
    expect(() => calculateTourPricing(tour([day()]), 0, true)).toThrow('greater than 0')
    expect(() => calculateTourPricing(tour([day()]), -1, true)).toThrow()
  })

  it('per_person_total is NOT rounded — exact division is preserved', () => {
    // 3 pax → ceil(3/2) = 2 rooms @ €100 = €200 total → 200 / 3 per person
    const t = tour([day({ accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }) })])
    const r = calculateTourPricing(t, 3, true)
    expect(r.totals.grand_total).toBe(200)
    expect(r.per_person).toBeCloseTo(200 / 3, 10)
    expect(r.per_person).not.toBe(33.33)
    expect(r.per_person * 3).toBeCloseTo(r.totals.grand_total, 10)
  })

  it('daily totals and category totals both sum to the grand total', () => {
    const t = tour([
      day({
        day_number: 1,
        accommodation: accommodation({ base_rate_eur: 100, base_rate_non_eur: 120 }),
        lunch_meal: meal({ base_rate_eur: 10, base_rate_non_eur: 12 }),
      }),
      day({ day_number: 2, guide_required: true, guide: guide({ base_rate_eur: 150, base_rate_non_eur: 150 }) }),
    ])
    const r = calculateTourPricing(t, 5, true)
    const byDay = r.daily_breakdown.reduce((acc, d) => acc + d.daily_total, 0)
    const byCategory =
      r.totals.total_accommodation +
      r.totals.total_meals +
      r.totals.total_guides +
      r.totals.total_transportation +
      r.totals.total_entrances +
      r.totals.total_additional_services
    expect(byDay).toBeCloseTo(r.totals.grand_total, 6)
    expect(byCategory).toBeCloseTo(r.totals.grand_total, 6)
  })
})

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('suggestVehicleType — pax boundaries', () => {
  it('maps each boundary to the documented vehicle', () => {
    expect(suggestVehicleType(1)).toBe('Sedan')
    expect(suggestVehicleType(2)).toBe('Sedan')
    expect(suggestVehicleType(3)).toBe('Minivan')
    expect(suggestVehicleType(8)).toBe('Minivan')
    expect(suggestVehicleType(9)).toBe('Van')
    expect(suggestVehicleType(14)).toBe('Van')
    expect(suggestVehicleType(15)).toBe('Bus')
    expect(suggestVehicleType(40)).toBe('Bus')
  })
})

describe('getMealsIncluded — board basis matrix', () => {
  it('covers BB / HB / FB / AI and unknown basis', () => {
    expect(getMealsIncluded('BB')).toEqual({ breakfast: true, lunch: false, dinner: false })
    expect(getMealsIncluded('HB')).toEqual({ breakfast: true, lunch: false, dinner: true })
    expect(getMealsIncluded('FB')).toEqual({ breakfast: true, lunch: true, dinner: true })
    expect(getMealsIncluded('AI')).toEqual({ breakfast: true, lunch: true, dinner: true })
    // Unknown basis includes nothing — never assumes meals exist.
    expect(getMealsIncluded('RO')).toEqual({ breakfast: false, lunch: false, dinner: false })
    expect(getMealsIncluded('')).toEqual({ breakfast: false, lunch: false, dinner: false })
  })
})

describe('formatCurrency', () => {
  it('formats to two decimals with the € default and custom symbols', () => {
    expect(formatCurrency(2.5)).toBe('€2.50')
    expect(formatCurrency(3.14159)).toBe('€3.14')
    expect(formatCurrency(0)).toBe('€0.00')
    expect(formatCurrency(1234.5, '$')).toBe('$1234.50')
  })
})

describe('calculatePercentage', () => {
  it('computes part/total × 100', () => {
    expect(calculatePercentage(25, 100)).toBe(25)
    expect(calculatePercentage(1, 3)).toBeCloseTo(33.3333, 3)
  })

  // Documented degenerate 0: with a 0 total there is no meaningful share.
  // This is a display helper (breakdown percentages), not a price, so the
  // 0 is a safe divide-by-zero guard, not a fabricated number.
  it('returns 0 when total is 0 (divide-by-zero guard)', () => {
    expect(calculatePercentage(50, 0)).toBe(0)
  })
})

describe('validateTour', () => {
  it('collects one error per missing required field', () => {
    const bad = {
      ...tour([]),
      tour_name: '  ',
      duration_days: 0,
      cities: [],
    }
    const r = validateTour(bad)
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('Tour name is required')
    expect(r.errors).toContain('Duration must be at least 1 day')
    expect(r.errors).toContain('At least one city is required')
    expect(r.errors).toContain('Tour must have at least one day planned')
    expect(r.errors).toHaveLength(4)
  })

  it('does NOT require days count to equal duration (partial builds allowed)', () => {
    const partial = { ...tour([day()]), duration_days: 5 }
    expect(validateTour(partial).valid).toBe(true)
  })
})

describe('generateTourCode', () => {
  it('builds TOUR-<NAME6>-<N>D-<4 digits> and strips non-alphanumerics', () => {
    const code = generateTourCode('Cairo & Luxor Deluxe!', 7)
    expect(code).toMatch(/^TOUR-CAIROL-7D-\d{4}$/)
  })

  it('tolerates a name with no alphanumeric characters (empty name segment)', () => {
    expect(generateTourCode('!!!', 3)).toMatch(/^TOUR--3D-\d{4}$/)
  })
})
