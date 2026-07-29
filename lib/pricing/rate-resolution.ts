// ============================================
// Canonical rate-resolution surface
// ============================================
// THE single import path for "look up a rate" across the app. Both pricing
// surfaces — the bespoke grid and the B2B multi-pax rate sheet — and any route
// that needs a rate must import from HERE, never reimplement lookups.
//
// Per the consolidation decision, the hardened implementations live in
// lib/auto-pricing-service.ts (Phase 1 of the harness: every lookup returns a
// real rate with provenance `source: 'db' | 'fuzzy'`, or null — it NEVER
// fabricates a default). This module re-exports them as the stable, canonical
// surface so consumers don't depend on the engine file directly and a future
// physical relocation is a no-op for callers.
//
// See docs/PRICING-CONSOLIDATION-PLAN.md (Phase A) and docs/PRICING-HARNESS-PLAN.md.

export {
  // Accommodation
  getHotelRates,
  getCruiseRates,
  // Per-day services
  getGuideRate,
  getMealRates,
  getTippingRate,
  getAirportServiceRate,
  getHotelServiceRate,
  // Per-person
  getEntranceFee,
  // Transport
  buildTransportCache,
  findTransportRate,
  // Transport helpers
  getVehicleTypeByPax,
  determineTransportNeeds,
  getAirportCode,
  getTierCategory,
  // Itinerary parsing (shared by intake adapters / surfaces)
  parseItinerary,
} from '@/lib/auto-pricing-service'

export type {
  ServiceTier,
  AccommodationType,
  MealStatus,
  VehicleType,
  TransportServiceType,
  TransportDuration,
  TransportArea,
} from '@/lib/auto-pricing-service'

// Provenance + hole types live in the harness types module.
export type { RateSource, PricingHole, HoleKind } from '@/lib/pricing-types'
