import { describe, it, expect } from 'vitest'
import {
  resolveAirportRates,
  resolveHotelServiceRate,
  airportCodeForCity,
  AIRPORT_SERVICE_BY_TIER,
  HOTEL_SERVICE_TYPE,
  HOTEL_SERVICE_CATEGORY,
} from '@/lib/ai/staff-rate-resolution'
import type { ServiceTier } from '@/lib/ai/parsing-utils'

// ============================================================================
// The generator used to sum every active row of the rate table. Against the
// real data that is €559 for one airport touch — every airport, both
// directions, every service level added together. These rows are the actual
// production contents of airport_staff_rates / hotel_staff_rates.
// ============================================================================

const AIRPORT_ROWS = [
  { airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: 15 },
  { airport_code: 'CAI', service_type: 'meet_greet', direction: 'departure', rate_eur: 10 },
  { airport_code: 'CAI', service_type: 'full_service', direction: 'arrival', rate_eur: 40 },
  { airport_code: 'CAI', service_type: 'full_service', direction: 'departure', rate_eur: 35 },
  { airport_code: 'CAI', service_type: 'vip_service', direction: 'both', rate_eur: 75 },
  { airport_code: 'CAI', service_type: 'customs_assist', direction: 'arrival', rate_eur: 25 },
  { airport_code: 'LXR', service_type: 'meet_greet', direction: 'arrival', rate_eur: 12 },
  { airport_code: 'LXR', service_type: 'meet_greet', direction: 'departure', rate_eur: 8 },
  { airport_code: 'LXR', service_type: 'full_service', direction: 'arrival', rate_eur: 30 },
  { airport_code: 'LXR', service_type: 'full_service', direction: 'departure', rate_eur: 25 },
]

const HOTEL_ROWS = [
  { service_type: 'porter', hotel_category: 'budget', rate_eur: 3 },
  { service_type: 'porter', hotel_category: 'standard', rate_eur: 5 },
  { service_type: 'porter', hotel_category: 'luxury', rate_eur: 8 },
  { service_type: 'porter', hotel_category: 'all', rate_eur: 5 },
  { service_type: 'concierge', hotel_category: 'all', rate_eur: 20 },
  { service_type: 'full_service', hotel_category: 'all', rate_eur: 15 },
]

describe('the operator mapping', () => {
  it('scales airport service by tier as decided', () => {
    expect(AIRPORT_SERVICE_BY_TIER).toEqual({
      budget: 'meet_greet',
      standard: 'meet_greet',
      deluxe: 'full_service',
      luxury: 'vip_service',
    })
  })

  it('uses one hotel rate for every tier', () => {
    expect(HOTEL_SERVICE_TYPE).toBe('porter')
    expect(HOTEL_SERVICE_CATEGORY).toBe('all')
  })
})

describe('resolveAirportRates — selects, never sums', () => {
  it('picks the tier service and the direction, not the total', () => {
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: 'Cairo' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rates.arrival).toBe(15)
    expect(r.rates.departure).toBe(10)
    // The old behaviour summed everything.
    const summed = AIRPORT_ROWS.reduce((s, x) => s + x.rate_eur, 0)
    expect(r.rates.arrival).not.toBe(summed)
  })

  it('gives deluxe the full_service rates', () => {
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'deluxe', city: 'Cairo' })
    expect(r.ok && r.rates.arrival).toBe(40)
    expect(r.ok && r.rates.departure).toBe(35)
  })

  it("uses a 'both' row for either direction — vip_service is stored that way", () => {
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'luxury', city: 'Cairo' })
    expect(r.ok && r.rates.arrival).toBe(75)
    expect(r.ok && r.rates.departure).toBe(75)
  })

  it('prefers an exact direction over a both row', () => {
    const rows = [
      { airport_code: 'CAI', service_type: 'meet_greet', direction: 'both', rate_eur: 99 },
      { airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: 15 },
    ]
    const r = resolveAirportRates(rows, { tier: 'standard', city: 'Cairo' })
    expect(r.ok && r.rates.arrival).toBe(15)
    expect(r.ok && r.rates.departure).toBe(99)
  })

  it('resolves per airport, not globally', () => {
    const cai = resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: 'Cairo' })
    const lxr = resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: 'Luxor' })
    expect(cai.ok && cai.rates.arrival).toBe(15)
    expect(lxr.ok && lxr.rates.arrival).toBe(12)
  })
})

describe('resolveAirportRates — refuses rather than guesses', () => {
  it('fails on a city with no airport mapping', () => {
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: 'Alexandria' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('unknown_city')
  })

  it('fails when the airport has no rows at all', () => {
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: 'Hurghada' })
    expect(!r.ok && r.reason).toBe('no_rates_for_airport')
  })

  it('fails when the tier’s service level is absent for that airport', () => {
    // LXR has no vip_service row, so luxury cannot be priced there.
    const r = resolveAirportRates(AIRPORT_ROWS, { tier: 'luxury', city: 'Luxor' })
    expect(!r.ok && r.reason).toBe('no_rate_for_service')
  })

  it('fails when only ONE direction resolves', () => {
    // Half-resolved would price arrivals and silently zero departures — the
    // exact failure this change exists to stop.
    const rows = [{ airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: 15 }]
    const r = resolveAirportRates(rows, { tier: 'standard', city: 'Cairo' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.detail).toContain('departure')
  })

  it('treats a zero or negative rate as bad data, not a free service', () => {
    for (const bad of [0, -5, null, 'abc']) {
      const rows = [
        { airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: bad as never },
        { airport_code: 'CAI', service_type: 'meet_greet', direction: 'departure', rate_eur: 10 },
      ]
      expect(resolveAirportRates(rows, { tier: 'standard', city: 'Cairo' }).ok, String(bad)).toBe(false)
    }
  })

  it('handles empty and null input without throwing', () => {
    expect(resolveAirportRates([], { tier: 'standard', city: 'Cairo' }).ok).toBe(false)
    expect(resolveAirportRates(null, { tier: 'standard', city: 'Cairo' }).ok).toBe(false)
    expect(resolveAirportRates(AIRPORT_ROWS, { tier: 'standard', city: null }).ok).toBe(false)
  })

  it('every tier resolves for a fully-stocked airport', () => {
    const tiers: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']
    for (const t of tiers) {
      expect(resolveAirportRates(AIRPORT_ROWS, { tier: t, city: 'Cairo' }).ok, t).toBe(true)
    }
  })
})

describe('airportCodeForCity', () => {
  it('is case and spacing tolerant', () => {
    expect(airportCodeForCity('Cairo')).toBe('CAI')
    expect(airportCodeForCity('  cairo  ')).toBe('CAI')
    expect(airportCodeForCity('SHARM EL SHEIKH')).toBe('SSH')
    expect(airportCodeForCity('Sharm  el-Sheikh')).toBe('SSH')
  })

  it('returns null rather than guessing', () => {
    expect(airportCodeForCity('Alexandria')).toBeNull()
    expect(airportCodeForCity('')).toBeNull()
    expect(airportCodeForCity(null)).toBeNull()
  })
})

describe('resolveHotelServiceRate', () => {
  it('picks porter at the all category', () => {
    const r = resolveHotelServiceRate(HOTEL_ROWS)
    expect(r.ok && r.rate).toBe(5)
  })

  it('does not sum the table', () => {
    const summed = HOTEL_ROWS.reduce((s, x) => s + x.rate_eur, 0)
    const r = resolveHotelServiceRate(HOTEL_ROWS)
    expect(r.ok && r.rate).not.toBe(summed)
  })

  it('fails when the all-category porter row is absent', () => {
    const r = resolveHotelServiceRate(HOTEL_ROWS.filter(x => x.hotel_category !== 'all'))
    expect(r.ok).toBe(false)
  })

  it('fails on empty or null input', () => {
    expect(resolveHotelServiceRate([]).ok).toBe(false)
    expect(resolveHotelServiceRate(null).ok).toBe(false)
  })

  it('rejects a zero rate', () => {
    const r = resolveHotelServiceRate([{ service_type: 'porter', hotel_category: 'all', rate_eur: 0 }])
    expect(r.ok).toBe(false)
  })
})
