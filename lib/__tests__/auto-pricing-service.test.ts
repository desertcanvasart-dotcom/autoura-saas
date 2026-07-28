import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTables } from './_mock-supabase'
import {
  TEMPLATE_ID,
  fullRateTables,
  missingHotelTables,
  fuzzyHotelTables,
} from './fixtures/sample-templates'

// Mock supabase-js BEFORE importing the engine (vitest hoists vi.mock).
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

// Imported after the mock is registered.
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const BASE_PARAMS = {
  templateId: TEMPLATE_ID,
  tenantId: 'test-tenant',
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

beforeAll(() => {
  // getSupabaseAdmin() throws if the URL is unset; createClient itself is mocked.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('calculateDayBasedPricing — golden master (full rates, standard, EUR)', () => {
  beforeEach(() => setMockTables(fullRateTables()))

  it('produces the locked pricing summary', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const pax2 = r.paxPricing.find((p) => p.numPax === 2)

    const summary = {
      success: r.success,
      complete: r.complete,
      holeCount: r.holes.length,
      hotelNights: r.hotelNights,
      cruiseNights: r.cruiseNights,
      singleSupplement: r.singleSupplement,
      serviceCount: r.services.length,
      warnings: r.warnings,
      pax2,
    }

    // Capture golden — regenerated with -u; locked thereafter.
    expect(summary).toMatchInlineSnapshot(`
      {
        "complete": true,
        "cruiseNights": 0,
        "holeCount": 0,
        "hotelNights": 2,
        "pax2": {
          "numPax": 2,
          "withLeader": {
            "marginAmount": 183.25,
            "pricePerPerson": 458.13,
            "sellingPrice": 916.25,
            "totalCost": 733,
            "tourLeaderCost": 221,
          },
          "withoutLeader": {
            "marginAmount": 115.5,
            "pricePerPerson": 288.75,
            "sellingPrice": 577.5,
            "totalCost": 462,
          },
        },
        "serviceCount": 9,
        "singleSupplement": 60,
        "success": true,
        "warnings": [],
      }
    `)
  })
})

describe('calculateDayBasedPricing — structural invariants (full rates)', () => {
  beforeEach(() => setMockTables(fullRateTables()))

  it('every pax row obeys cost/margin/selling arithmetic', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.paxPricing.length).toBe(40)

    for (const row of r.paxPricing) {
      for (const variant of [row.withoutLeader, row.withLeader]) {
        // selling = cost + margin
        expect(variant.sellingPrice).toBeCloseTo(
          variant.totalCost + variant.marginAmount,
          2
        )
        // margin = cost × marginPercent
        expect(variant.marginAmount).toBeCloseTo(
          variant.totalCost * (BASE_PARAMS.marginPercent / 100),
          1
        )
        // per-person × pax ≈ selling (within rounding)
        expect(variant.pricePerPerson * row.numPax).toBeCloseTo(
          variant.sellingPrice,
          0
        )
        // nothing negative or NaN
        expect(variant.totalCost).toBeGreaterThanOrEqual(0)
        expect(Number.isNaN(variant.sellingPrice)).toBe(false)
      }
      // tour leader strictly adds cost
      expect(row.withLeader.totalCost).toBeGreaterThanOrEqual(
        row.withoutLeader.totalCost
      )
    }
  })

  it('fixed costs amortize overall — a large group is cheaper per person than solo', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const perPersonByPax = r.paxPricing.map((p) => p.withoutLeader.pricePerPerson)
    // NOTE: per-person is NOT strictly monotonic — it steps UP at vehicle-capacity
    // boundaries (e.g. 7→8 pax forces Minivan→Van), which is correct. We assert the
    // overall trend: the largest group amortizes fixed/transport costs vs. a solo pax.
    const solo = perPersonByPax[0]
    const largest = perPersonByPax[perPersonByPax.length - 1]
    expect(largest).toBeLessThan(solo)
  })
})

describe('calculateDayBasedPricing — determinism', () => {
  it('two runs on identical input produce identical output', async () => {
    setMockTables(fullRateTables())
    const a = await calculateDayBasedPricing(BASE_PARAMS)
    setMockTables(fullRateTables())
    const b = await calculateDayBasedPricing(BASE_PARAMS)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// Phase 1: "never fabricate — flag the hole". These assert the NEW behaviour
// (they replaced the pre-Phase-1 characterization tests).
// ---------------------------------------------------------------------------
describe('calculateDayBasedPricing — strict completeness (full rates)', () => {
  beforeEach(() => setMockTables(fullRateTables()))

  it('is complete with zero holes when every rate resolves exactly', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(true)
    expect(r.holes).toEqual([])
  })

  it('never emits a service line with a fabricated "default" rateSource', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.services.some((s: any) => s.rateSource === 'default')).toBe(false)
  })
})

describe('calculateDayBasedPricing — missing rate flags a hole (no fabrication)', () => {
  beforeEach(() => setMockTables(missingHotelTables()))

  it('runs (success) but is NOT complete when accommodation is missing', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.success).toBe(true)
    expect(r.complete).toBe(false)
  })

  it('records a hotel hole and emits NO fabricated hotel line', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    const hotelHole = r.holes.find((h) => h.kind === 'hotel')
    expect(hotelHole).toBeDefined()
    expect(hotelHole?.city).toBe('Cairo')
    expect(hotelHole?.reason).toBe('missing')
    // The old behaviour fabricated a €50 default hotel line — it must be gone.
    const hotelLine = r.services.find((s: any) => s.rateSource === 'hotel_contacts')
    expect(hotelLine).toBeUndefined()
  })
})

describe('calculateDayBasedPricing — fuzzy match blocks (treated as a hole)', () => {
  beforeEach(() => setMockTables(fuzzyHotelTables()))

  it('a wrong-tier hotel match is a fuzzy hole, not a deliverable rate', async () => {
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    expect(r.complete).toBe(false)
    const hole = r.holes.find((h) => h.kind === 'hotel')
    expect(hole?.reason).toBe('fuzzy')
  })
})
