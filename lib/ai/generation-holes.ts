// ============================================
// RATE HOLES FOR AI ITINERARY GENERATION — harness Layer 1
// ============================================
// `app/api/ai/generate-itinerary` used to substitute constants when a rate
// lookup came back empty or errored:
//
//     const airportServiceRate = rows?.reduce(...) || 25    // table missing
//     const hotelServiceRate   = rows?.reduce(...) || 15    // table missing
//     let   lunchRate  = toNumber(rows?.[0]?.lunch_rate_eur, 12)
//     let   dinnerRate = toNumber(rows?.[0]?.dinner_rate_eur, 18)
//
// and silently used 0 for vehicle, guide and tips when those tables were
// empty — producing a quote that says transport is free. Every one of these
// was written to `itineraries` as total_cost / total_revenue / supplier_cost /
// profit with status 'quoted', and the send-path gate could not catch it:
// checkAmountDeliverable validates arithmetic, not provenance, so a plausible
// positive total passes.
//
// This module collects the gaps instead, using the same PricingHole vocabulary
// as lib/auto-pricing-service.ts. `HoleKind` already defines every kind needed
// here — 'meal', 'guide', 'transport', 'airport_service', 'hotel_service' —
// so nothing new is invented.
//
// The caller's contract: if any hole is recorded, DO NOT price. Save the
// itinerary as a draft and hand the holes back so the operator is told exactly
// which rate table to populate.

import type { PricingHole, HoleKind } from '@/lib/pricing-types'

/** A supabase-shaped error. Only the fields we act on. */
export interface LookupError {
  code?: string
  message?: string
}

export interface HoleCollector {
  holes: PricingHole[]
  addHole: (hole: PricingHole) => void
}

/**
 * Dedup by kind + day + lookup, mirroring auto-pricing-service's `addHole`.
 * The same missing table hit from several days is one gap to fix, not twenty.
 */
export function createHoleCollector(): HoleCollector {
  const holes: PricingHole[] = []
  const seen = new Set<string>()

  const addHole = (hole: PricingHole) => {
    const key = `${hole.kind}|${hole.dayNumber ?? ''}|${hole.lookupAttempted}`
    if (seen.has(key)) return
    seen.add(key)
    holes.push(hole)
  }

  return { holes, addHole }
}

export interface RateRequirement {
  kind: HoleKind
  tier: string
  /** Table queried, named in the operator-facing message. */
  table: string
  /** Human-readable description of the lookup that failed. */
  lookupAttempted: string
  /** What the operator should do, and where. */
  message: string
  /** The error the query returned, if any. */
  error?: LookupError | null
  /** Rows the query returned. */
  rows?: unknown[] | null
}

/**
 * True when the lookup produced usable rows. Records a hole and returns false
 * otherwise, so the caller can gate on rate availability rather than fall back
 * to a constant.
 *
 * A missing TABLE and an empty table are recorded differently: the first is a
 * schema problem the operator cannot fix from the UI, the second is data they
 * can add. Both block pricing, but the message has to say which.
 */
export function requireRates(collector: HoleCollector, req: RateRequirement): boolean {
  const base = {
    kind: req.kind,
    tier: req.tier,
    lookupAttempted: req.lookupAttempted,
  }

  if (req.error) {
    // PGRST205/42P01 mean the table itself is absent — the code is asking for
    // something that was never created, which no amount of data entry fixes.
    const missingTable = req.error.code === 'PGRST205' || req.error.code === '42P01'
    collector.addHole({
      ...base,
      reason: 'missing',
      message: missingTable
        ? `Rate table "${req.table}" does not exist, so this cost cannot be priced. This needs a fix in the app, not data entry.`
        : `Could not read "${req.table}" (${req.error.code ?? 'error'}). ${req.message}`,
    })
    return false
  }

  if (!req.rows || req.rows.length === 0) {
    collector.addHole({
      ...base,
      reason: 'missing',
      message: req.message,
    })
    return false
  }

  return true
}

/**
 * One line per gap, for the generation response. Deliberately plain: the
 * operator needs to know what to add, not what the code did.
 */
export function describeHoles(holes: PricingHole[]): string[] {
  return holes.map(h => h.message)
}

/**
 * Headline for a generation that could not be priced. States the outcome
 * first — the itinerary was still built and saved — so an operator does not
 * read this as "generation failed".
 */
export function unpricedSummary(holes: PricingHole[]): string {
  const n = holes.length
  return (
    `Itinerary created, but not priced: ${n} rate ${n === 1 ? 'gap' : 'gaps'} ` +
    `must be filled first. Nothing has been quoted, so no figure here can be sent to a client.`
  )
}
