import { describe, it, expect } from 'vitest'
import {
  generateShareToken,
  isValidShareToken,
  toClientItinerary,
  toClientTeam,
  toClientTripEvents,
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

describe('toClientTeam — the allowlist for people', () => {
  // Assignment rows carrying the operator's cost base and internal notes.
  const POISONED_RESOURCES = [
    {
      id: 'res-1', tenant_id: 'TENANT-SECRET', itinerary_id: 'itin-1',
      resource_type: 'guide', resource_id: 'g-1', resource_name: 'Ahmed Hassan',
      start_date: '2026-09-02', end_date: '2026-09-04', status: 'confirmed',
      cost_eur: 400, cost_non_eur: 19000, notes: 'INTERNAL: client is difficult',
      quantity: 1,
    },
    {
      id: 'res-2', tenant_id: 'TENANT-SECRET', itinerary_id: 'itin-1',
      resource_type: 'vehicle', resource_id: 'v-1', resource_name: 'Luxury Van (Cairo)',
      start_date: '2026-09-01', end_date: '2026-09-07',
      cost_eur: 850, notes: 'negotiated below rate card',
    },
    // unknown type must be dropped, not guessed at
    { resource_type: 'submarine', resource_id: 'x', resource_name: 'Nope', start_date: '2026-09-01' },
  ]
  const POISONED_CONTACTS = {
    guides: [{
      id: 'g-1', name: 'Ahmed Hassan', full_name: 'Ahmed M. Hassan',
      phone: '+20 100 555 0101', whatsapp: '+20 100 555 0101',
      profile_photo_url: 'https://cdn.example/ahmed.jpg',
      daily_rate: 200, hourly_rate: 30,
      emergency_contact_name: 'MUST NOT LEAK', emergency_contact_phone: 'MUST-NOT-LEAK',
      email: 'private@example.com', address: 'MUST NOT LEAK', license_number: 'LIC-123',
    }],
    vehicles: [{
      id: 'v-1', name: 'Mercedes V-Class', vehicle_type: 'Van',
      default_driver_name: 'Mostafa', default_driver_phone: '+20 122 555 0202',
      photo_url: 'https://cdn.example/van.jpg',
      daily_rate: 120, rate_per_km: 0.6, insurance_expiry: '2027-01-01',
      license_plate: 'MUST NOT LEAK', supplier_id: 'sup-9',
    }],
  }

  it('keeps only the allowlist and sorts by start date', () => {
    const team = toClientTeam(POISONED_RESOURCES, POISONED_CONTACTS)
    expect(team).toHaveLength(2)                       // submarine dropped
    expect(team[0].type).toBe('vehicle')               // 09-01 before 09-02
    expect(team[0].name).toBe('Mercedes V-Class')
    expect(team[0].driverName).toBe('Mostafa')
    expect(team[0].phone).toBe('+20 122 555 0202')
    expect(team[1].type).toBe('guide')
    expect(team[1].name).toBe('Ahmed Hassan')
    expect(team[1].whatsapp).toBe('+20 100 555 0101')
    expect(team[1].photoUrl).toBe('https://cdn.example/ahmed.jpg')
  })

  it('lets NOTHING from the cost base or private fields survive', () => {
    const json = JSON.stringify(toClientTeam(POISONED_RESOURCES, POISONED_CONTACTS))
    for (const secret of [
      '400', '19000', '850', '200', '120', '0.6',        // costs and rates
      'INTERNAL', 'negotiated',                            // notes
      'MUST NOT LEAK', 'MUST-NOT-LEAK',                    // emergency contacts, address, plate
      'TENANT-SECRET', 'g-1', 'v-1', 'sup-9',              // ids
      'private@example.com', 'LIC-123',
    ]) {
      expect(json, `leaked: ${secret}`).not.toContain(secret)
    }
  })

  it('a resource with no matching contact still appears, contactless', () => {
    const team = toClientTeam(
      [{ resource_type: 'hotel', resource_id: 'h-1', resource_name: 'Steigenberger', start_date: '2026-09-01', cost_eur: 999 }],
      {}
    )
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({ type: 'hotel', name: 'Steigenberger', phone: null, whatsapp: null })
  })
})

describe('toClientTripEvents — the checkpoint allowlist', () => {
  const RESOURCES = [
    { id: 'res-1', resource_name: 'Ahmed Hassan' },
    { id: 'res-2', resource_name: 'Mercedes V-Class' },
  ]
  const POISONED_EVENTS = [
    {
      id: 'ev-1', tenant_id: 'TENANT-SECRET', itinerary_id: 'itin-1',
      itinerary_resource_id: 'res-2', event_kind: 'en_route',
      occurred_at: '2026-09-02T08:47:00Z', lat: 30.0444, lng: 31.2357,
      note: 'INTERNAL: client complained about pickup time',
      actor_name: 'office-user@company.com',
    },
    {
      id: 'ev-2', itinerary_resource_id: 'res-1', event_kind: 'picked_up',
      occurred_at: '2026-09-02T09:15:00Z',
      note: 'MUST NOT LEAK', actor_name: 'MUST-NOT-LEAK',
    },
    // internal annotation kind: dropped entirely from the customer timeline
    { event_kind: 'note', occurred_at: '2026-09-02T10:00:00Z', note: 'internal only' },
    // bogus kind: dropped, not guessed at
    { event_kind: 'teleported', occurred_at: '2026-09-02T11:00:00Z' },
  ]

  it('keeps the allowlist, joins names, sorts newest first', () => {
    const evs = toClientTripEvents(POISONED_EVENTS, RESOURCES)
    expect(evs).toHaveLength(2)                       // note + bogus dropped
    expect(evs[0].kind).toBe('picked_up')             // 09:15 before 08:47 desc
    expect(evs[0].teamMemberName).toBe('Ahmed Hassan')
    expect(evs[1].kind).toBe('en_route')
    expect(evs[1].teamMemberName).toBe('Mercedes V-Class')
    expect(evs[1].lat).toBeCloseTo(30.0444)
  })

  it('lets NOTHING internal survive — notes, actors, ids', () => {
    const json = JSON.stringify(toClientTripEvents(POISONED_EVENTS, RESOURCES))
    for (const secret of [
      'INTERNAL', 'MUST NOT LEAK', 'MUST-NOT-LEAK',
      'office-user@company.com', 'TENANT-SECRET', 'ev-1', 'itin-1', 'res-1', 'res-2',
      'internal only',
    ]) {
      expect(json, `leaked: ${secret}`).not.toContain(secret)
    }
  })

  it('an event with no resource still shows, unattributed', () => {
    const evs = toClientTripEvents(
      [{ event_kind: 'arrived', occurred_at: '2026-09-01T12:00:00Z' }], []
    )
    expect(evs).toHaveLength(1)
    expect(evs[0].teamMemberName).toBeNull()
  })
})
