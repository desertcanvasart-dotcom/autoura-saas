import { NextResponse } from 'next/server'

/**
 * Billing Middleware
 * Handles usage tracking and limit enforcement for metered features
 */

/**
 * NOTE — the SQL enforcement path used to live here.
 *
 * `checkLimit()` called the `check_usage_limit` RPC, `trackUsage()` called
 * `increment_usage` with a legacy metric vocabulary and no window, and
 * `withBillingCheck()` wrapped both. All three were dead: `checkLimit` was
 * imported once and invoked zero times, so nothing reached the RPC.
 *
 * They could only ever express two of the five limits in lib/pricing-config.ts,
 * hard-blocked at 100% with no grace band, and read usage from whichever
 * `tenant_usage` row had not yet expired rather than the computed window the
 * gates use. Enforcement now lives entirely in lib/usage-limits.ts and
 * lib/usage-enforcement.ts; migration 241 drops the RPC and the plan limit
 * columns it read.
 *
 * `logActivity` below is unrelated and still live.
 */

/**
 * Log activity for audit trail
 */
export async function logActivity(
  tenantId: string,
  userId: string,
  actionType: string,
  supabase: any,
  options?: {
    resourceType?: string
    resourceId?: string
    details?: any
    ipAddress?: string
    userAgent?: string
  }
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_activity', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_action_type: actionType,
      p_resource_type: options?.resourceType || null,
      p_resource_id: options?.resourceId || null,
      p_details: options?.details || null,
      p_ip_address: options?.ipAddress || null,
      p_user_agent: options?.userAgent || null
    })

    if (error) {
      console.error('Error logging activity:', error)
    }
  } catch (err) {
    console.error('Error in logActivity:', err)
  }
}

/**
 * Check if user has a specific feature based on their subscription plan
 */
export async function hasFeature(
  tenantId: string,
  feature: string,
  supabase: any
): Promise<boolean> {
  try {
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select(`
        plan:subscription_plans(features)
      `)
      .eq('tenant_id', tenantId)
      .in('status', ['trialing', 'active'])
      .single()

    if (!subscription || !subscription.plan) {
      return false
    }

    const features = subscription.plan.features || []
    return features.includes(feature)
  } catch (err) {
    console.error('Error checking feature:', err)
    return false
  }
}

/**
 * Get recommended plan for a feature
 */
export function getRequiredPlanForFeature(feature: string): string | null {
  const featureToPlan: Record<string, string> = {
    'custom_branding': 'Professional',
    'api_access': 'Professional',
    'priority_support': 'Professional',
    'unlimited_history': 'Professional',
    'advanced_analytics': 'Enterprise',
    'custom_integrations': 'Enterprise',
    'dedicated_support': 'Enterprise',
    'sla': 'Enterprise'
  }

  return featureToPlan[feature] || null
}

/**
 * Create a standardized "upgrade required" response
 */
export function upgradeRequiredResponse(feature: string): NextResponse {
  const requiredPlan = getRequiredPlanForFeature(feature)

  return NextResponse.json(
    {
      success: false,
      error: `This feature requires ${requiredPlan || 'a higher'} plan`,
      feature_locked: true,
      feature: feature,
      required_plan: requiredPlan,
      upgrade_url: '/admin/billing/plans'
    },
    { status: 403 }
  )
}
