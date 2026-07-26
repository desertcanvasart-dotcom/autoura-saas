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
 * Unlimited is now an explicit `null` in pricing-config.ts, matching the
 * database convention directly.
 *
 * The previous shape encoded it as large sentinels (999 / 9999), which needed
 * bridging here — and a first attempt using a ">= 999" threshold silently
 * turned Business's real 1500 quotes/month cap into "unlimited", i.e. a paid
 * limit that would never enforce. Removing the sentinels removes that whole
 * class of bug.
 */

/** Prices in pricing-config are USD. The column defaults to EUR — be explicit. */
export const PLAN_CURRENCY = 'USD'

/**
 * A row of `subscription_plans`, derived — never authored by hand.
 *
 * EVERY KEY MUST BE A REAL COLUMN. The upsert sends the object as-is, so an
 * extra key fails the whole write at boot. A `limits` key slipped in during
 * the tier restructure and would have broken the deploy sync; a test now
 * pins the key set.
 *
 * Note what the table CANNOT express: itineraries/year, B2B partners and
 * brands have no columns, so they live only in pricing-config.ts until the
 * enforcement work adds a `limits` JSONB column alongside their meters.
 */
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
  return value
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
      max_team_members: toDbLimit(tier.limits.users),
      // Quotes are recorded, not gated — the column stays for the legacy RPC.
      max_quotes_per_month: null,
      // AI generations is the gated meter; itineraries are annual and enforced
      // in application code, not by this monthly column.
      max_itinerary_runs_per_month: toDbLimit(tier.limits.aiGenerationsPerMonth),
      max_pricing_runs_per_month: null,
      // Stored so the plan catalogue is self-describing; `check_usage_limit`
      // does not read this column. Carries the real limits and the
      // capabilities that exist, for anything reading the DB directly.
      features: {
        ...tier.capabilities,
        publiclyPriced: tier.publiclyPriced,
      },
      is_active: true,
    }))
}

/** The committed artifact's exact bytes. Trailing newline keeps diffs clean. */
export function renderPlansArtifact(rows: PlanRow[] = buildPlanRows()): string {
  return JSON.stringify(rows, null, 2) + '\n'
}
