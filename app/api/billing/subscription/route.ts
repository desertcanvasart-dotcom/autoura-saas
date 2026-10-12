import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { PRICING_TIERS } from '@/lib/pricing-config'

/**
 * GET /api/billing/subscription
 * Get current tenant subscription details
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // The real subscription (tenant_subscriptions, kept by the Stripe
    // webhook) — the page showed a mock: tenant_features' tier or
    // "Professional", always Active, never a renewal or trial date, while
    // the plan limits were enforced from this table.
    const { data: sub, error } = await supabase
      .from('tenant_subscriptions')
      .select('status, current_period_end, trial_ends_at, canceled_at, ends_at, plan:subscription_plans(slug, name)')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    const plan = (sub as { plan?: { slug?: string; name?: string } | null } | null)?.plan
    if (!sub || !plan?.slug) {
      return NextResponse.json({ success: true, subscription: null, has_subscription: false, message: 'No subscription' })
    }

    const periodEnd = (sub as { current_period_end?: string | null }).current_period_end ?? null
    const days = periodEnd ? Math.ceil((Date.parse(periodEnd) - Date.now()) / 86_400_000) : 0
    const tier = PRICING_TIERS[plan.slug]
    return NextResponse.json({
      success: true,
      subscription: {
        plan_name: tier?.name ?? plan.name ?? plan.slug,
        plan_slug: plan.slug,
        status: (sub as { status: string }).status,
        current_period_end: periodEnd,
        trial_end: (sub as { trial_ends_at?: string | null }).trial_ends_at ?? null,
        // Cancelled but still running to the end of the period.
        cancel_at_period_end: !!(sub as { canceled_at?: string | null }).canceled_at && ['active', 'trialing'].includes((sub as { status: string }).status),
        days_until_renewal: Math.max(0, days),
      },
      has_subscription: true,
    })
  } catch (error: any) {
    console.error('Error fetching subscription:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
