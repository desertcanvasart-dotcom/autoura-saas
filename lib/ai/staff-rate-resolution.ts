// ============================================
// AIRPORT & HOTEL STAFF RATES — resolution
// ============================================
// Phase 2 of the fabricated-rates fix.
//
// The generator queried `airport_services` and `hotel_services`, which do not
// exist, and fell back to €25 and €15. The populated tables are
// `airport_staff_rates` (24 rows) and `hotel_staff_rates` (15 rows).
//
// The old code did `rows.reduce((sum, r) => sum + r.rate_eur, 0)` — a blind sum
// over every active row. Against the real tables that is every airport, both
// directions and every service level added together: €559 for one airport
// touch. Selection, not summation, is what these tables need.
//
// MULTIPLICITY IS ALREADY CORRECT and is not changed here. lib/ai/service-
// creation.ts adds an airport service on every qualifying day (arrival,
// departure, or a flight) and a hotel service on every day that needs one, so
// an itinerary that returns to the same city is charged each time. This module
// only decides WHICH RATE that occurrence uses.
//
// The two mappings below are pricing decisions made by the operator
// (2026-07-27), not derived from the data. They are the only place to change
// what a tier buys.

import type { ServiceTier } from '@/lib/ai/parsing-utils'
import { presetTierFor } from '@/lib/vocabulary'

/** Airport assistance level sold at each PRESET tier. Operator decision. A
 *  tenant's own tier is mapped onto the preset by ladder position
 *  (presetTierFor) before this is read. */
export const AIRPORT_SERVICE_BY_TIER: Record<string, string> = {
  budget: 'meet_greet',
  standard: 'meet_greet',
  deluxe: 'full_service',
  luxury: 'vip_service',
}

/**
 * Hotel assistance is one rate for every tier — the operator does not vary it.
 *
 * `porter` because that is what the line item created in service-creation.ts
 * actually says it is ("Hotel Porterage & Assistance"). Change these two
 * constants together to sell a different level.
 */
export const HOTEL_SERVICE_TYPE = 'porter'
export const HOTEL_SERVICE_CATEGORY = 'all'

/**
 * City to IATA code, for the airports that have rates.
 * A city with no mapping produces a hole rather than a guessed airport.
 */
const CITY_TO_AIRPORT: Record<string, string> = {
  cairo: 'CAI',
  giza: 'CAI',
  luxor: 'LXR',
  aswan: 'ASW',
  hurghada: 'HRG',
  'sharm el sheikh': 'SSH',
  'sharm el-sheikh': 'SSH',
  'sharm elsheikh': 'SSH',
  sharm: 'SSH',
}

export function airportCodeForCity(city: string | null | undefined): string | null {
  if (!city) return null
  const key = city.trim().toLowerCase().replace(/\s+/g, ' ')
  return CITY_TO_AIRPORT[key] ?? null
}

/** A row of airport_staff_rates, narrowed to what resolution reads. */
export interface AirportStaffRateRow {
  airport_code?: string | null
  service_type?: string | null
  direction?: string | null
  rate_eur?: number | string | null
}

export interface HotelStaffRateRow {
  service_type?: string | null
  hotel_category?: string | null
  rate_eur?: number | string | null
}

/** Rates for one airport, by the direction of travel on a given day. */
export interface AirportServiceRates {
  arrival: number
  departure: number
  airportCode: string
  serviceType: string
}

function toRate(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  // A zero or negative staff rate is not a free service, it is bad data.
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : null
}

/**
 * The rate for one direction. `both` covers either way — vip_service is stored
 * that way — and an exact direction match wins over it.
 */
function pickDirectional(
  rows: AirportStaffRateRow[],
  direction: 'arrival' | 'departure'
): number | null {
  const exact = rows.find(r => r.direction === direction)
  if (exact) return toRate(exact.rate_eur)
  const both = rows.find(r => r.direction === 'both')
  return both ? toRate(both.rate_eur) : null
}

export type AirportResolution =
  | { ok: true; rates: AirportServiceRates }
  | { ok: false; reason: 'unknown_city' | 'no_rates_for_airport' | 'no_rate_for_service'; detail: string }

/**
 * Resolve arrival and departure rates for the itinerary's airport at this tier.
 *
 * Both directions must resolve. A half-resolved airport would price arrivals
 * and silently zero departures, which is the failure this whole change exists
 * to stop.
 */
export function resolveAirportRates(
  rows: AirportStaffRateRow[] | null | undefined,
  opts: { tier: ServiceTier; city: string | null | undefined; ladder?: readonly string[] }
): AirportResolution {
  const code = airportCodeForCity(opts.city)
  if (!code) {
    return {
      ok: false,
      reason: 'unknown_city',
      detail: `No airport is mapped for "${opts.city ?? 'unknown city'}"`,
    }
  }

  const serviceType = AIRPORT_SERVICE_BY_TIER[presetTierFor(opts.ladder ?? [], opts.tier)]
  const forAirport = (rows ?? []).filter(r => r.airport_code === code)
  if (forAirport.length === 0) {
    return {
      ok: false,
      reason: 'no_rates_for_airport',
      detail: `No active airport staff rates for ${code}`,
    }
  }

  const forService = forAirport.filter(r => r.service_type === serviceType)
  const arrival = pickDirectional(forService, 'arrival')
  const departure = pickDirectional(forService, 'departure')

  if (arrival === null || departure === null) {
    const missing = [
      arrival === null ? 'arrival' : null,
      departure === null ? 'departure' : null,
    ].filter(Boolean).join(' and ')
    return {
      ok: false,
      reason: 'no_rate_for_service',
      detail: `${code} has no ${serviceType} rate for ${missing}`,
    }
  }

  return { ok: true, rates: { arrival, departure, airportCode: code, serviceType } }
}

export type HotelResolution =
  | { ok: true; rate: number; serviceType: string; category: string }
  | { ok: false; detail: string }

/** Resolve the single hotel assistance rate. */
export function resolveHotelServiceRate(
  rows: HotelStaffRateRow[] | null | undefined
): HotelResolution {
  const match = (rows ?? []).find(
    r => r.service_type === HOTEL_SERVICE_TYPE && r.hotel_category === HOTEL_SERVICE_CATEGORY
  )
  const rate = match ? toRate(match.rate_eur) : null
  if (rate === null) {
    return {
      ok: false,
      detail: `No active ${HOTEL_SERVICE_TYPE} rate in the "${HOTEL_SERVICE_CATEGORY}" category`,
    }
  }
  return { ok: true, rate, serviceType: HOTEL_SERVICE_TYPE, category: HOTEL_SERVICE_CATEGORY }
}
