import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, multiTierRateTables } from './fixtures/sample-templates'

// Phase 5 drift guard: lock the engine's computed per-person prices across a
// canonical basket (every tier × both passports). Any code change that shifts
// a number — intended or not — fails CI here, surfacing the drift for review.
// See PRICING-HARNESS-PLAN.md.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, type ServiceTier } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

describe('golden basket — cross-tier price drift guard', () => {
  it('locks per-person prices for every tier × passport', async () => {
    const basket: Record<string, unknown> = {}

    for (const tier of TIERS) {
      for (const isEurPassport of [true, false]) {
        setMockTables(multiTierRateTables())
        const r = await calculateDayBasedPricing({
          templateId: TEMPLATE_ID,
          tier,
          isEurPassport,
          language: 'English',
          marginPercent: 25,
        })
        const pp = (n: number) =>
          r.paxPricing.find((p) => p.numPax === n)!.withoutLeader.pricePerPerson

        basket[`${tier}/${isEurPassport ? 'eur' : 'non-eur'}`] = {
          complete: r.complete,
          holes: r.holes.length,
          pp2: pp(2),
          pp10: pp(10),
        }
      }
    }

    expect(basket).toMatchInlineSnapshot(`
      {
        "budget/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 175.38,
          "pp2": 224.38,
        },
        "budget/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 154.13,
          "pp2": 203.13,
        },
        "deluxe/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 325.88,
          "pp2": 391.88,
        },
        "deluxe/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 304.63,
          "pp2": 370.63,
        },
        "luxury/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 459.38,
          "pp2": 539.38,
        },
        "luxury/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 438.13,
          "pp2": 518.13,
        },
        "standard/eur": {
          "complete": true,
          "holes": 0,
          "pp10": 231.25,
          "pp2": 288.75,
        },
        "standard/non-eur": {
          "complete": true,
          "holes": 0,
          "pp10": 210,
          "pp2": 267.5,
        },
      }
    `)
  })
})
