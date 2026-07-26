// ============================================
// PLAN CATALOGUE SYNC — pricing-config.ts is canonical
// ============================================
// Plan limits lived in THREE places that disagreed:
//
//   lib/pricing-config.ts   4 tiers, $49/$149/$349/$999
//   subscription_plans      3 rows,  $49/$149/$399, different limits
//   check_usage_limit RPC   the actual gate — reads subscription_plans
//
// So `PRICING_TIERS` was decorative: editing it changed the billing UI and
// nothing a tenant could actually do. This module makes it canonical by
// deriving the database rows from it.
//
// Pipeline:
//   1. buildPlanRows()             pure, here
//   2. supabase/generated/plans.json   committed artifact, snapshot-tested
//      -> lib/__tests__/plans-sync.test.ts FAILS THE BUILD if the config
//         changed without the artifact being regenerated (`vitest -u`)
//   3. scripts/sync-plans.mjs      applies the artifact on every deploy, so
//      a row edited directly in production is overwritten on next boot
//
// The artifact exists because the deploy script is plain Node and cannot
// import TypeScript (Node 20, no loader in dependencies). It is generated,
// never hand-edited.

import { PRICING_TIERS, type PricingTier } from './pricing-config'

/**
 * `pricing-config.ts` encodes "unlimited" as one of two exact sentinels
 * (`999` users, `9999` for the rest) while the database uses NULL.
 *
 * These must be matched EXACTLY, not by a ">= threshold" rule: Business
 * genuinely allows 1500 quotes/month, and a threshold of 999 silently turned
 * that real cap into "unlimited" — a paid limit that would never enforce.
 * Caught by inspecting the generated artifact before it shipped.
 *
 * Phase 1.2 replaces the sentinels with explicit nulls; this set goes with them.
 */
export const UNLIMITED_SENTINELS: ReadonlySet<number> = new Set([999, 9999])

/** Prices in pricing-config are USD. The column defaults to EUR — be explicit. */
export const PLAN_CURRENCY = 'USD'

/** A row of `subscription_plans`, derived — never authored by hand. */
export interface PlanRow {
  name: string
  slug: string
  description: string
  price_monthly: number | null
  price_yearly: number | null
  currency: string
  max_team_members: number | null
  max_quotes_per_month: number | null
  max_itinerary_runs_per_month: number | null
  /**
   * Never gated. The pricing engine is deterministic — no LLM anywhere in
   * auto-pricing-service / tourCalculator / pax-range — so metering
   * recalculation would charge for the core loop. NULL = unlimited.
   */
  max_pricing_runs_per_month: null
  features: Record<string, boolean>
  is_active: boolean
}

/** Map a config limit onto the database's NULL-means-unlimited convention. */
export function toDbLimit(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  return UNLIMITED_SENTINELS.has(value) ? null : value
}

/** One database row per configured tier, ordered by slug for a stable artifact. */
export function buildPlanRows(
  tiers: Record<string, PricingTier> = PRICING_TIERS
): PlanRow[] {
  return Object.values(tiers)
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(tier => ({
      name: tier.name,
      slug: tier.slug,
      description: tier.description,
      price_monthly: tier.monthlyPrice,
      price_yearly: tier.annualPrice,
      currency: PLAN_CURRENCY,
      max_team_members: toDbLimit(tier.maxUsers),
      max_quotes_per_month: toDbLimit(tier.maxQuotesPerMonth),
      max_itinerary_runs_per_month: toDbLimit(tier.maxItinerariesPerMonth),
      max_pricing_runs_per_month: null,
      // Stored so the plan catalogue is self-describing; `check_usage_limit`
      // does not read this column.
      features: { ...tier.features },
      is_active: true,
    }))
}

/** The committed artifact's exact bytes. Trailing newline keeps diffs clean. */
export function renderPlansArtifact(rows: PlanRow[] = buildPlanRows()): string {
  return JSON.stringify(rows, null, 2) + '\n'
}
