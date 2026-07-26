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
import {
  computeUsageWindow,
  resolveUsageAnchor,
  windowKeys,
  type UsageWindow,
  type WindowKind,
} from './usage-window'
import { classifyUsage, type BandAssessment } from './usage-grace'

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

/**
 * Limits measured by counting events in a window, because past events leave
 * no countable trace. Windows are COMPUTED (lib/usage-window.ts), not stored:
 * `current_period_start` only advances via the Stripe webhook, so a tenant
 * without a Stripe subscription would otherwise never roll over.
 *
 * NOT INCLUDED: `pricing_runs`. The pricing engine calls no LLM — verified
 * across auto-pricing-service, tourCalculator, pax-range, rate-resolution and
 * both calculate routes — and recalculation happens constantly as pax, tier
 * and dates change. Metering it would charge for the core loop. It stays
 * cost-bearing telemetry, never gated.
 */
export type VolumeMetric = 'ai_generations' | 'itineraries'

const VOLUME_SOURCES: Record<VolumeMetric, {
  column: string
  window: WindowKind
  limitKey: keyof PricingTier['limits']
  label: string
}> = {
  ai_generations: {
    column: 'itinerary_runs',
    window: 'monthly',
    limitKey: 'aiGenerationsPerMonth',
    label: 'AI generations this month',
  },
  itineraries: {
    column: 'itineraries_created',
    window: 'annual',
    limitKey: 'itinerariesPerYear',
    label: 'itineraries this year',
  },
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
): Promise<{ plan: ResolvedPlan | null; anchor?: Date | null; reason?: FailOpenReason }> {
  try {
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .select('status, current_period_start, plan:subscription_plans(slug, name)')
      .eq('tenant_id', tenantId)
      .in('status', ['trialing', 'active'])
      .limit(1)
      .maybeSingle()

    if (error) return { plan: null, reason: 'query_error' }
    if (!data?.plan?.slug) return { plan: null, reason: 'no_subscription' }

    const tier = PRICING_TIERS[data.plan.slug]
    if (!tier) return { plan: null, reason: 'unknown_plan' }

    return {
      plan: { slug: tier.slug, name: tier.name, limits: tier.limits },
      anchor: resolveUsageAnchor({ subscriptionPeriodStart: data.current_period_start }),
    }
  } catch {
    return { plan: null, reason: 'client_error' }
  }
}

/**
 * Anchor for a tenant's usage windows, falling back to tenant creation so a
 * pre-billing tenant still gets real rolling windows rather than a frozen one.
 */
async function resolveAnchorWithFallback(
  supabase: Client,
  tenantId: string,
  fromSubscription: Date | null | undefined
): Promise<Date | null> {
  if (fromSubscription) return fromSubscription
  try {
    const { data } = await supabase
      .from('tenants')
      .select('created_at')
      .eq('id', tenantId)
      .maybeSingle()
    return resolveUsageAnchor({ tenantCreatedAt: data?.created_at ?? null })
  } catch {
    return null
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

// ============================================
// VOLUME LIMITS — metered, with grace bands
// ============================================

export interface VolumeDecision extends BandAssessment {
  metric: VolumeMetric
  current: number
  /** null = unlimited. */
  limit: number | null
  planSlug: string | null
  /** The computed window this count belongs to. */
  window: UsageWindow | null
  /** Set when allowed WITHOUT verifying entitlement. */
  failOpenReason?: FailOpenReason
  /** Present once the operator is at or past their plan. */
  upgradeUrl?: string
  /** Operator-facing label for the metric, for message building. */
  label: string
}

/** Usage recorded in `window` for this metric. */
export async function countVolume(
  supabase: Client,
  tenantId: string,
  metric: VolumeMetric,
  window: UsageWindow
): Promise<{ count: number | null; reason?: FailOpenReason }> {
  const source = VOLUME_SOURCES[metric]
  const keys = windowKeys(window)
  try {
    const { data, error } = await supabase
      .from('tenant_usage')
      .select(source.column)
      .eq('tenant_id', tenantId)
      .eq('period_start', keys.period_start)
      .maybeSingle()

    if (error) return { count: null, reason: 'query_error' }
    // No row for this window simply means nothing has been used in it yet —
    // that is zero, not an error.
    return { count: Number(data?.[source.column] ?? 0) }
  } catch {
    return { count: null, reason: 'client_error' }
  }
}

/**
 * May this tenant create one more of `metric`?
 *
 * Unlike structural limits, volume limits do NOT hard-block at 100%: they
 * warn at 80%, allow overage past 100%, and only stop at 125%. Blocking a DMC
 * mid-season is a churn event, and an overage is a sales conversation rather
 * than an error page.
 */
export async function checkVolumeLimit(
  supabase: Client,
  tenantId: string,
  metric: VolumeMetric
): Promise<VolumeDecision> {
  const source = VOLUME_SOURCES[metric]
  const base = {
    metric,
    label: source.label,
    planSlug: null as string | null,
    window: null as UsageWindow | null,
  }

  const { plan, anchor: subAnchor, reason: planReason } = await resolveTenantPlan(supabase, tenantId)

  if (!plan) {
    return {
      ...base,
      ...classifyUsage(0, null),
      current: 0,
      limit: null,
      failOpenReason: planReason ?? 'no_subscription',
    }
  }

  const limit = plan.limits[source.limitKey]
  if (limit === null) {
    return { ...base, ...classifyUsage(0, null), current: 0, limit: null, planSlug: plan.slug }
  }

  const anchor = await resolveAnchorWithFallback(supabase, tenantId, subAnchor)
  if (!anchor) {
    // No anchor means no window, which means no defensible count — allow.
    return {
      ...base,
      ...classifyUsage(0, null),
      current: 0,
      limit,
      planSlug: plan.slug,
      failOpenReason: 'no_subscription',
    }
  }

  const window = computeUsageWindow(anchor, source.window)
  const { count, reason: countReason } = await countVolume(supabase, tenantId, metric, window)

  if (count === null) {
    return {
      ...base,
      ...classifyUsage(0, null),
      current: 0,
      limit,
      planSlug: plan.slug,
      window,
      failOpenReason: countReason ?? 'query_error',
    }
  }

  const assessment = classifyUsage(count, limit)
  return {
    ...base,
    ...assessment,
    current: count,
    limit,
    planSlug: plan.slug,
    window,
    // Surfaced from 100% onward: at overage it accompanies a notice, at the
    // stop it is the way out. A limit must never be a dead end.
    ...(assessment.inOverage ? { upgradeUrl: UPGRADE_URL } : {}),
  }
}
