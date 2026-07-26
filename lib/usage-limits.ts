// ============================================
// STRUCTURAL LIMITS — counted live, never metered
// ============================================
// Seats and B2B partners are *stock*, not *flow*: the question is "how many
// exist right now", not "how many happened this month". So they are counted
// with SELECT count(*) rather than an incrementing meter.
//
// That choice matters. A counter can drift from reality — a member deleted
// outside the app, a failed increment, a window that never rolled — and once
// it drifts it stays wrong until someone notices. A live count cannot: it
// self-heals on deletion and has no window to get stuck in.
//
// Volume metrics (AI generations per month, itineraries per year) DO need
// meters, because past events leave no countable trace. Those use
// lib/usage-window.ts and are wired separately.
//
// POLICY, inherited from migration 235: fail OPEN when entitlement cannot be
// determined, fail CLOSED only on a measured over-limit. Every fail-open is
// recorded (fail_open_events) so "we are not enforcing" is a number somebody
// can look at, rather than the silent state that hid the 402 outage.

import { PRICING_TIERS, type PricingTier } from './pricing-config'

/**
 * Limits counted by looking at what exists.
 *
 * NOT INCLUDED: `brands`. The tier table defines a brands limit (Solo 1,
 * Studio 1, Agency 3, Enterprise unlimited) but the data model has nothing to
 * count — `tenant` is the top-level entity, there is no organisation above it,
 * and `concierge_brand_mappings` describes concierge webhook routing rather
 * than brand identity. Multi-brand document branding is already on the
 * roadmap list precisely because it does not exist. Counting the concierge
 * mappings would invent a gate for a feature that isn't there.
 */
export type StructuralMetric = 'seats' | 'b2b_partners'

/** Which table and filter backs each structural metric. */
const STRUCTURAL_SOURCES: Record<StructuralMetric, {
  table: string
  /**
   * Statuses that occupy the limit. An INVITED member holds a seat — otherwise
   * a tenant could invite without bound and only pay once people accept.
   * A SUSPENDED member does not; that is the point of suspending them.
   */
  statuses?: string[]
}> = {
  seats: { table: 'tenant_members', statuses: ['active', 'invited'] },
  b2b_partners: { table: 'b2b_partners' },
}

/** Which tier limit each structural metric maps to. */
const STRUCTURAL_LIMIT_KEY: Record<StructuralMetric, keyof PricingTier['limits']> = {
  seats: 'users',
  b2b_partners: 'b2bPartners',
}

export interface ResolvedPlan {
  slug: string
  name: string
  limits: PricingTier['limits']
}

export type FailOpenReason =
  | 'no_subscription'
  | 'unknown_plan'
  | 'query_error'
  | 'client_error'

export interface LimitDecision {
  allowed: boolean
  metric: StructuralMetric
  current: number
  /** null = unlimited. */
  limit: number | null
  planSlug: string | null
  /** Set when the check was allowed WITHOUT verifying entitlement. */
  failOpenReason?: FailOpenReason
  /** Shown at the block; a limit must never be a dead end. */
  upgradeUrl?: string
}

const UPGRADE_URL = '/settings/billing/plans'

/* eslint-disable @typescript-eslint/no-explicit-any -- the supabase client is
   untyped here; every access is guarded and shapes are asserted in tests. */
type Client = any

/**
 * The plan a tenant is entitled to, resolved through the same join the
 * enforcement RPC uses.
 *
 * Returns null when there is no active subscription or the slug is not in the
 * catalogue — both mean "cannot determine", and the caller must fail open.
 */
export async function resolveTenantPlan(
  supabase: Client,
  tenantId: string
): Promise<{ plan: ResolvedPlan | null; reason?: FailOpenReason }> {
  try {
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .select('status, plan:subscription_plans(slug, name)')
      .eq('tenant_id', tenantId)
      .in('status', ['trialing', 'active'])
      .limit(1)
      .maybeSingle()

    if (error) return { plan: null, reason: 'query_error' }
    if (!data?.plan?.slug) return { plan: null, reason: 'no_subscription' }

    const tier = PRICING_TIERS[data.plan.slug]
    if (!tier) return { plan: null, reason: 'unknown_plan' }

    return { plan: { slug: tier.slug, name: tier.name, limits: tier.limits } }
  } catch {
    return { plan: null, reason: 'client_error' }
  }
}

/** How many of `metric` exist right now for this tenant. */
export async function countStructural(
  supabase: Client,
  tenantId: string,
  metric: StructuralMetric
): Promise<{ count: number | null; reason?: FailOpenReason }> {
  const source = STRUCTURAL_SOURCES[metric]
  try {
    let query = supabase
      .from(source.table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    if (source.statuses) query = query.in('status', source.statuses)

    const { count, error } = await query
    if (error) return { count: null, reason: 'query_error' }
    return { count: count ?? 0 }
  } catch {
    return { count: null, reason: 'client_error' }
  }
}

/**
 * May this tenant create one more of `metric`?
 *
 * Structural limits hard-block at 100% — unlike volume metrics, which get
 * grace bands. Adding a seat is a planned decision, not something a DMC does
 * mid-quote under time pressure, so blocking cannot strand anyone.
 */
export async function checkStructuralLimit(
  supabase: Client,
  tenantId: string,
  metric: StructuralMetric
): Promise<LimitDecision> {
  const { plan, reason: planReason } = await resolveTenantPlan(supabase, tenantId)

  if (!plan) {
    return {
      allowed: true,
      metric,
      current: 0,
      limit: null,
      planSlug: null,
      failOpenReason: planReason ?? 'no_subscription',
    }
  }

  const limit = plan.limits[STRUCTURAL_LIMIT_KEY[metric]]
  if (limit === null) {
    return { allowed: true, metric, current: 0, limit: null, planSlug: plan.slug }
  }

  const { count, reason: countReason } = await countStructural(supabase, tenantId, metric)
  if (count === null) {
    return {
      allowed: true,
      metric,
      current: 0,
      limit,
      planSlug: plan.slug,
      failOpenReason: countReason ?? 'query_error',
    }
  }

  const allowed = count < limit
  return {
    allowed,
    metric,
    current: count,
    limit,
    planSlug: plan.slug,
    ...(allowed ? {} : { upgradeUrl: UPGRADE_URL }),
  }
}

/**
 * Record that a check was allowed without verifying entitlement.
 *
 * Fire-and-forget: never awaited on a request path, and never allowed to
 * throw. Losing a telemetry row must not fail the user's action — but a
 * non-trivial rate of these means enforcement is not actually running.
 */
export function recordFailOpen(
  supabase: Client,
  input: { tenantId: string | null; metric: string; reason: FailOpenReason; detail?: string }
): void {
  try {
    const result = supabase.from('fail_open_events').insert({
      tenant_id: input.tenantId,
      metric: input.metric,
      reason: input.reason,
      detail: input.detail ?? null,
    })
    // Supabase builders are thenable; swallow rejection without awaiting.
    if (result && typeof result.then === 'function') {
      result.then(
        (res: { error?: unknown }) => {
          if (res?.error) console.error('fail-open telemetry insert failed:', res.error)
        },
        (err: unknown) => console.error('fail-open telemetry insert threw:', err)
      )
    }
  } catch (err) {
    console.error('fail-open telemetry could not be recorded:', err)
  }
}
