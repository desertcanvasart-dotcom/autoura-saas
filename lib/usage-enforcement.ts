// ============================================
// ENFORCEMENT AT THE CREATE PATHS
// ============================================
// Thin layer between the decision functions (lib/usage-limits.ts) and the API
// routes, so each handler gains a few lines rather than a policy.
//
// Response contract:
//   blocked  -> 402 with { error, usage: {...} }
//   allowed  -> the route's normal response, plus a `usage` block when the
//               band is warning/overage so the UI can show a banner without
//               the request failing
//   fail-open-> the route's normal response, nothing user-visible, and a row
//               in fail_open_events
//
// 402 matches what /api/ai/generate-itinerary already returns, so existing
// client handling keeps working.
//
// ORDERING RULE for callers: check -> create -> increment. Incrementing before
// creation would burn allowance on failed creates. The increment is
// fire-and-forget so a telemetry failure cannot fail a successful create.

import { NextResponse } from 'next/server'
import {
  checkStructuralLimit,
  checkVolumeLimit,
  recordFailOpen,
  type LimitDecision,
  type VolumeDecision,
  type StructuralMetric,
  type VolumeMetric,
} from './usage-limits'
import { describeBand, type UsageBand } from './usage-grace'
import { computeUsageWindow, resolveUsageAnchor, windowKeys } from './usage-window'

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped supabase client */
type Client = any

/** What the UI needs to render a banner or a block. */
export interface UsageNotice {
  metric: string
  band: UsageBand
  current: number
  limit: number | null
  message: string | null
  upgradeUrl?: string
}

/** Metric name the `increment_usage` RPC expects. */
const INCREMENT_METRIC: Record<VolumeMetric, string> = {
  ai_generations: 'itinerary_runs',
  itineraries: 'itineraries',
}

/** Window kind each volume metric is measured over. */
const INCREMENT_WINDOW: Record<VolumeMetric, 'monthly' | 'annual'> = {
  ai_generations: 'monthly',
  itineraries: 'annual',
}

function isVolume(d: LimitDecision | VolumeDecision): d is VolumeDecision {
  return 'band' in d
}

/** Build the `usage` block, or null when there is nothing worth saying. */
export function toUsageNotice(
  decision: LimitDecision | VolumeDecision,
  label: string
): UsageNotice | null {
  if (isVolume(decision)) {
    if (decision.band === 'ok') return null
    return {
      metric: decision.metric,
      band: decision.band,
      current: decision.current,
      limit: decision.limit,
      message: describeBand(decision, {
        metricLabel: label,
        current: decision.current,
        limit: decision.limit,
      }),
      ...(decision.upgradeUrl ? { upgradeUrl: decision.upgradeUrl } : {}),
    }
  }

  // Structural limits are binary — only worth reporting when they block.
  if (decision.allowed) return null
  return {
    metric: decision.metric,
    band: 'blocked',
    current: decision.current,
    limit: decision.limit,
    message: `You have reached your plan's limit for ${label} (${decision.current} of ${decision.limit}). Existing records stay available; upgrade to add more.`,
    ...(decision.upgradeUrl ? { upgradeUrl: decision.upgradeUrl } : {}),
  }
}

/** The 402 a blocked create returns. */
export function blockedResponse(
  decision: LimitDecision | VolumeDecision,
  label: string
): NextResponse {
  const usage = toUsageNotice(decision, label)
  return NextResponse.json(
    {
      success: false,
      error: usage?.message ?? `Plan limit reached for ${label}`,
      limit_reached: true,
      usage,
    },
    { status: 402 }
  )
}

export interface GateResult {
  /** True when the route should proceed. */
  ok: boolean
  /** Present when ok === false — return this from the handler. */
  response?: NextResponse
  /** Attach to a successful response body so the UI can warn. */
  usage: UsageNotice | null
}

/**
 * Gate a structural create (seats, B2B partners).
 *
 * Fails open on any inability to determine entitlement, recording why.
 */
export async function gateStructural(
  supabase: Client,
  tenantId: string,
  metric: StructuralMetric,
  label: string
): Promise<GateResult> {
  const decision = await checkStructuralLimit(supabase, tenantId, metric)

  if (decision.failOpenReason) {
    recordFailOpen(supabase, {
      tenantId,
      metric,
      reason: decision.failOpenReason,
      detail: decision.planSlug ?? undefined,
    })
    return { ok: true, usage: null }
  }

  if (!decision.allowed) {
    return { ok: false, response: blockedResponse(decision, label), usage: null }
  }
  return { ok: true, usage: toUsageNotice(decision, label) }
}

/**
 * Gate a metered create (AI generations, itineraries).
 *
 * Allowed through the warning and overage bands — only the hard stop blocks.
 */
export async function gateVolume(
  supabase: Client,
  tenantId: string,
  metric: VolumeMetric,
  label: string
): Promise<GateResult> {
  const decision = await checkVolumeLimit(supabase, tenantId, metric)

  if (decision.failOpenReason) {
    recordFailOpen(supabase, {
      tenantId,
      metric,
      reason: decision.failOpenReason,
      detail: decision.planSlug ?? undefined,
    })
    return { ok: true, usage: null }
  }

  if (!decision.allowed) {
    return { ok: false, response: blockedResponse(decision, label), usage: null }
  }
  return { ok: true, usage: toUsageNotice(decision, label) }
}

/**
 * Record one unit of usage AFTER the record was created.
 *
 * Passes the COMPUTED window so the writer and the reader agree — keying on
 * the subscription's frozen period would make usage appear to reset every
 * time the real window rolled.
 *
 * Fire-and-forget: never awaited on the request path, never throws. A lost
 * increment under-counts; a thrown one would fail a create that already
 * succeeded.
 */
export function incrementVolumeUsage(
  supabase: Client,
  tenantId: string,
  metric: VolumeMetric,
  anchor: Date | string | null
): void {
  try {
    const resolved = resolveUsageAnchor({
      subscriptionPeriodStart: anchor ?? null,
    })
    if (!resolved) return

    const window = computeUsageWindow(resolved, INCREMENT_WINDOW[metric])
    const keys = windowKeys(window)

    const result = supabase.rpc('increment_usage', {
      p_tenant_id: tenantId,
      p_metric: INCREMENT_METRIC[metric],
      p_amount: 1,
      p_period_start: keys.period_start,
      p_period_end: keys.period_end,
    })

    if (result && typeof result.then === 'function') {
      result.then(
        (res: { error?: unknown }) => {
          if (res?.error) console.error(`usage increment failed (${metric}):`, res.error)
        },
        (err: unknown) => console.error(`usage increment threw (${metric}):`, err)
      )
    }
  } catch (err) {
    console.error(`usage increment could not be recorded (${metric}):`, err)
  }
}

/**
 * The anchor to hand `incrementVolumeUsage`, read once per request.
 * Subscription period start, else tenant creation.
 */
export async function loadUsageAnchor(
  supabase: Client,
  tenantId: string
): Promise<Date | null> {
  try {
    const { data: sub } = await supabase
      .from('tenant_subscriptions')
      .select('current_period_start')
      .eq('tenant_id', tenantId)
      .in('status', ['trialing', 'active'])
      .limit(1)
      .maybeSingle()

    if (sub?.current_period_start) {
      return resolveUsageAnchor({ subscriptionPeriodStart: sub.current_period_start })
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('created_at')
      .eq('id', tenantId)
      .maybeSingle()

    return resolveUsageAnchor({ tenantCreatedAt: tenant?.created_at ?? null })
  } catch {
    return null
  }
}
