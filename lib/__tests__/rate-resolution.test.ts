import { describe, it, expect } from 'vitest'
import * as rateResolution from '@/lib/pricing/rate-resolution'
import * as engine from '@/lib/auto-pricing-service'

// Consolidation Phase A: the canonical rate-resolution surface. These tests
// guard the facade — that every lookup is exposed and is the SAME hardened
// implementation, so no one silently forks a second copy. See
// docs/PRICING-CONSOLIDATION-PLAN.md.

const CANONICAL_LOOKUPS = [
  'getHotelRates',
  'getCruiseRates',
  'getGuideRate',
  'getMealRates',
  'getTippingRate',
  'getAirportServiceRate',
  'getHotelServiceRate',
  'getEntranceFee',
  'buildTransportCache',
  'findTransportRate',
  'getVehicleTypeByPax',
  'determineTransportNeeds',
  'getAirportCode',
  'getTierCategory',
  'parseItinerary',
] as const

describe('rate-resolution facade', () => {
  it('exposes every canonical lookup as a function', () => {
    for (const fn of CANONICAL_LOOKUPS) {
      expect(typeof (rateResolution as any)[fn]).toBe('function')
    }
  })

  it('re-exports the SAME hardened implementation (no duplicate copy)', () => {
    for (const fn of CANONICAL_LOOKUPS) {
      expect((rateResolution as any)[fn]).toBe((engine as any)[fn])
    }
  })
})
