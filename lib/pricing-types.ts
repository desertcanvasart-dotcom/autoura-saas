// Shared pricing-provenance types for the correctness harness.
// See PRICING-HARNESS-PLAN.md (Layer 1).

/**
 * Where a price component came from.
 * - 'db'      a real, exactly-matched rate row — the ONLY deliverable source
 * - 'fuzzy'   matched only by keyword / partial / substitution / tier fallback.
 *             Per the locked policy this is NOT deliverable — it blocks like a hole.
 * - 'missing' no rate found at all.
 */
export type RateSource = 'db' | 'fuzzy' | 'missing'

export type HoleKind =
  | 'hotel'
  | 'cruise'
  | 'guide'
  | 'meal'
  | 'entrance'
  | 'transport'
  | 'tipping'
  | 'airport_service'
  | 'hotel_service'
  // Used by the AI build-quote route when no tour template matches strongly
  // enough to back a deliverable price. Different from the rate-level kinds
  // above — this is a hole at the template-match step, before any rate lookup
  // happens. The caller surfaces it the same way as a missing rate:
  // needs_manual_pricing + a holes array.
  | 'template'

/**
 * A gap in the rate data that prevents a definite price.
 * The engine NEVER fills a hole with a guessed/default number — it records one
 * of these and marks the result `complete: false`.
 */
export interface PricingHole {
  kind: HoleKind
  /** Why this rate is unusable. */
  reason: 'missing' | 'fuzzy'
  dayNumber?: number
  city?: string
  attraction?: string
  vehicleType?: string
  tier: string
  /** Human-readable description of the lookup that failed. */
  lookupAttempted: string
  /** Operator-facing message: what to add, and where. */
  message: string
}
