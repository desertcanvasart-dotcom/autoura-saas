import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  checkStructuralLimit,
  checkVolumeLimit,
  resolveTenantPlan,
} from '@/lib/usage-limits'
import { classifyUsage, describeBand } from '@/lib/usage-grace'

/**
 * GET /api/billing/usage — what the operator is using, against what they bought.
 *
 * This route runs the SAME four checks the create paths gate on
 * (lib/usage-limits.ts), so the page can never show "you have room" while the
 * gate says otherwise. It previously read limit columns off `subscription_plans`
 * and usage off whichever `tenant_usage` row had not yet expired, which is a
 * different window from the computed one enforcement uses.
 *
 * Four metrics, because four are real. Quotes, WhatsApp messages, Gmail
 * accounts and storage were also reported, but nothing increments those meters
 * and no plan sets those limits, so every tenant saw "0 of unlimited" forever.
 */

interface ReportedMetric {
  key: string
  label: string
  used: number
  /** null = unlimited. */
  limit: number | null
  percentage: number | null
  band: 'ok' | 'warning' | 'overage' | 'blocked'
  message: string | null
  /** Present for metered limits; structural ones are a live count, not a window. */
  window: { start: string; end: string } | null
  /** True when we could not verify entitlement and allowed anyway. */
  undetermined: boolean
}

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult

    if (!tenant_id) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 })
    }
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    const { plan } = await resolveTenantPlan(supabase, tenant_id)

    const [seats, partners, aiGenerations, itineraries] = await Promise.all([
      checkStructuralLimit(supabase, tenant_id, 'seats'),
      checkStructuralLimit(supabase, tenant_id, 'b2b_partners'),
      checkVolumeLimit(supabase, tenant_id, 'ai_generations'),
      checkVolumeLimit(supabase, tenant_id, 'itineraries'),
    ])

    const report = (
      key: string,
      label: string,
      d: {
        current: number
        limit: number | null
        failOpenReason?: string
        window?: { start: Date; end: Date } | null
      }
    ): ReportedMetric => {
      const assessment = classifyUsage(d.current, d.limit)
      return {
        key,
        label,
        used: d.current,
        limit: d.limit,
        percentage:
          assessment.ratio === null ? null : Math.min(Math.round(assessment.ratio * 100), 999),
        band: assessment.band,
        message: describeBand(assessment, {
          metricLabel: label.toLowerCase(),
          current: d.current,
          limit: d.limit,
        }),
        window: d.window
          ? { start: d.window.start.toISOString(), end: d.window.end.toISOString() }
          : null,
        undetermined: Boolean(d.failOpenReason),
      }
    }

    const metrics: ReportedMetric[] = [
      report('seats', 'Team members', seats),
      report('b2b_partners', 'B2B partners', partners),
      report('ai_generations', 'AI generations this month', aiGenerations),
      report('itineraries', 'Itineraries this year', itineraries),
    ]

    // A warning is worth showing only when we actually know the limit. An
    // undetermined check allowed the operation without verifying entitlement —
    // reporting that as "approaching your limit" would be inventing a number.
    const warnings = metrics
      .filter((m) => !m.undetermined && m.band !== 'ok' && m.message)
      .map((m) => m.message as string)

    return NextResponse.json({
      success: true,
      plan: plan ? { slug: plan.slug, name: plan.name } : null,
      metrics,
      warnings,
      needs_upgrade: metrics.some((m) => !m.undetermined && m.band !== 'ok'),
      upgrade_url: '/settings/billing/plans',
    })
  } catch (error: unknown) {
    console.error('Error fetching usage:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
