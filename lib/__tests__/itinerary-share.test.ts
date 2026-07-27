import { describe, it, expect } from 'vitest'
import {
  generateShareToken,
  isValidShareToken,
  toClientItinerary,
} from '@/lib/itinerary-share'

// ============================================================================
// The share page is the first surface where trip data crosses the auth
// boundary ON PURPOSE. These tests pin the two things that make that safe:
// tokens that cannot be guessed, and a projection that cannot leak the cost
// base no matter what the query returns.
// ============================================================================

describe('generateShareToken', () => {
  it('is 32 chars of base64url and validates against its own checker', () => {
    for (let i = 0; i < 20; i++) {
      const t = generateShareToken()
      expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
      expect(isValidShareToken(t)).toBe(true)
    }
  })

  it('never repeats across a large sample', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateShareToken()))
    expect(seen.size).toBe(1000)
  })
})

describe('isValidShareToken — rejects before the database is touched', () => {
  it('rejects malformed, truncated and injected values', () => {
    for (const bad of [
      '', null, undefined,
      'short',
      'a'.repeat(31), 'a'.repeat(33),
      "x'; DROP TABLE itinerary_shares;--",
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/',   // '/' is not base64url
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',   // padding never appears
    ]) {
      expect(isValidShareToken(bad as string), String(bad)).toBe(false)
    }
  })
})

describe('toClientItinerary — the allowlist', () => {
  // A row carrying everything that must NOT reach a traveller.
  const POISONED_ITINERARY = {
    trip_name: 'Cairo & Nile',
    itinerary_code: 'T2E-001',
    start_date: '2026-09-01',
    end_date: '2026-09-08',
    total_days: 8,
    num_adults: 2,
    num_children: 1,
    currency: 'EUR',
    total_cost: 2400,
    tier: 'deluxe',
    // ---- must never survive ----
    supplier_cost: 1500,
    profit: 900,
    margin_percent: 37.5,
    total_revenue: 2400,
    notes: 'client haggled hard, keep margin hidden',
    cost_mode: 'net',
    tenant_id: 'tt-1',
    client_id: 'cc-1',
    id: 'ii-1',
  }

  const POISONED_DAY = {
    day_number: 1,
    title: 'Arrival',
    description: 'Meet & assist',
    city: 'Cairo',
    attractions: ['Pyramids of Giza', 42, null],
    lunch_included: true,
    dinner_included: false,
    hotel_included: true,
    hotel_name: 'Nile Ritz',
    is_arrival: true,
    // ---- must never survive ----
    tenant_id: 'tt-1',
    hotel_id: 'hh-1',
    guide_required: true,
    transport_type: 'private-van',
  }

  it('carries the traveller-facing fields', () => {
    const v = toClientItinerary(POISONED_ITINERARY, [POISONED_DAY])
    expect(v.tripName).toBe('Cairo & Nile')
    expect(v.totalPrice).toBe(2400)
    expect(v.days[0].attractions).toEqual(['Pyramids of Giza'])
    expect(v.days[0].hotelName).toBe('Nile Ritz')
  })

  it('NOTHING from the cost base survives, at any depth', () => {
    const v = toClientItinerary(POISONED_ITINERARY, [POISONED_DAY])
    const flat = JSON.stringify(v)
    for (const secret of [
      'supplier_cost', 'profit', 'margin', 'total_revenue', 'cost_mode',
      'tenant_id', 'client_id', 'hotel_id', 'haggled',
      '1500', '900', '37.5',
    ]) {
      expect(flat, secret).not.toContain(secret)
    }
  })

  it('internal notes are absent even though they exist on the row', () => {
    const v = toClientItinerary(POISONED_ITINERARY, [])
    expect(JSON.stringify(v)).not.toContain('notes')
  })

  it('sorts days and tolerates junk without throwing', () => {
    const v = toClientItinerary(
      { trip_name: null, total_cost: 'abc' },
      [{ day_number: 3 }, { day_number: 1 }, {}]
    )
    expect(v.tripName).toBe('Your trip')
    expect(v.totalPrice).toBeNull()
    expect(v.days.map((d) => d.dayNumber)).toEqual([0, 1, 3])
  })
})
