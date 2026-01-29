import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * Billing Middleware
 * Handles usage tracking and limit enforcement for metered features
 */

export type MetricType = 'quotes' | 'whatsapp_messages' | 'gmail_emails' | 'pdfs' | 'api_calls' | 'team_members' | 'gmail_accounts'

export interface LimitCheckResult {
  allowed: boolean
  limit: number | null
  current: number
  subscription_status: string
  plan_name: string
  upgrade_url?: string
}

export interface UsageTrackingResult {
  success: boolean
  metric: MetricType
  new_count: number
}

/**
 * Check if tenant has reached usage limit for a specific metric
 * Returns detailed information about the limit status
 */
export async function checkLimit(
  tenantId: string,
  metric: MetricType,
  supabase: any
): Promise<LimitCheckResult> {
  try {
    // Call the database function to check limit
    const { data, error } = await supabase.rpc('check_usage_limit', {
      p_tenant_id: tenantId,
      p_metric: metric
    })

    if (error) {
      console.error('Error checking usage limit:', error)
      // Default to allowing if check fails (fail open)
      return {
        allowed: true,
        limit: null,
        current: 0,
        subscription_status: 'unknown',
        plan_name: 'unknown'
      }
    }

    // Get subscription details for better error messages
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select(`
        status,
        plan:subscription_plans(
          name,
          max_quotes_per_month,
          max_whatsapp_messages,
          max_team_members,
          max_gmail_accounts
        )
      `)
      .eq('tenant_id', tenantId)
      .in('status', ['trialing', 'active'])
      .single()

    const allowed = data === true
    const plan = subscription?.plan

    let limit: number | null = null
    let current = 0

    if (plan) {
      switch (metric) {
        case 'quotes':
          limit = plan.max_quotes_per_month
          break
        case 'whatsapp_messages':
          limit = plan.max_whatsapp_messages
          break
        case 'team_members':
          limit = plan.max_team_members
          break
        case 'gmail_accounts':
          limit = plan.max_gmail_accounts
          break
      }

      // Get current usage for display
      if (['quotes', 'whatsapp_messages', 'gmail_emails', 'pdfs', 'api_calls'].includes(metric)) {
        const { data: usage } = await supabase
          .from('tenant_usage')
          .select('*')
          .eq('tenant_id', tenantId)
          .gte('period_end', new Date().toISOString())
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (usage) {
          switch (metric) {
            case 'quotes':
              current = usage.quotes_created || 0
              break
            case 'whatsapp_messages':
              current = usage.whatsapp_messages_sent || 0
              break
            case 'gmail_emails':
              current = usage.gmail_emails_fetched || 0
              break
            case 'pdfs':
              current = usage.pdfs_generated || 0
              break
            case 'api_calls':
              current = usage.api_calls || 0
              break
          }
        }
      } else if (metric === 'team_members') {
        const { count } = await supabase
          .from('tenant_members')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)

        current = count || 0
      } else if (metric === 'gmail_accounts') {
        const { data: members } = await supabase
          .from('tenant_members')
          .select('user_id')
          .eq('tenant_id', tenantId)

        if (members && members.length > 0) {
          const { count } = await supabase
            .from('gmail_tokens')
            .select('*', { count: 'exact', head: true })
            .in('user_id', members.map((m: { user_id: string }) => m.user_id))

          current = count || 0
        }
      }
    }

    return {
      allowed,
      limit,
      current,
      subscription_status: subscription?.status || 'none',
      plan_name: plan?.name || 'No Plan',
      upgrade_url: !allowed ? '/admin/billing/plans' : undefined
    }
  } catch (err) {
    console.error('Error in checkLimit:', err)
    // Fail open - allow operation if check fails
    return {
      allowed: true,
      limit: null,
      current: 0,
      subscription_status: 'error',
      plan_name: 'Error'
    }
  }
}

/**
 * Increment usage counter for a specific metric
 * Should be called AFTER the operation succeeds
 */
export async function trackUsage(
  tenantId: string,
  metric: MetricType,
  amount: number = 1,
  supabase: any
): Promise<UsageTrackingResult> {
  try {
    // Call the database function to increment usage
    const { error } = await supabase.rpc('increment_usage', {
      p_tenant_id: tenantId,
      p_metric: metric,
      p_amount: amount
    })

    if (error) {
      console.error('Error tracking usage:', error)
      return {
        success: false,
        metric,
        new_count: 0
      }
    }

    // Get updated count
    let new_count = amount

    if (['quotes', 'whatsapp_messages', 'gmail_emails', 'pdfs', 'api_calls'].includes(metric)) {
      const { data: usage } = await supabase
        .from('tenant_usage')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('period_end', new Date().toISOString())
        .order('period_start', { ascending: false })
        .limit(1)
        .single()

      if (usage) {
        switch (metric) {
          case 'quotes':
            new_count = usage.quotes_created || 0
            break
          case 'whatsapp_messages':
            new_count = usage.whatsapp_messages_sent || 0
            break
          case 'gmail_emails':
            new_count = usage.gmail_emails_fetched || 0
            break
          case 'pdfs':
            new_count = usage.pdfs_generated || 0
            break
          case 'api_calls':
            new_count = usage.api_calls || 0
            break
        }
      }
    }

    return {
      success: true,
      metric,
      new_count
    }
  } catch (err) {
    console.error('Error in trackUsage:', err)
    return {
      success: false,
      metric,
      new_count: 0
    }
  }
}

/**
 * Middleware wrapper to check limits and track usage for an endpoint
 * Use this for endpoints that should enforce billing limits
 */
export async function withBillingCheck(
  request: NextRequest,
  metric: MetricType,
  handler: (req: NextRequest, authResult: any) => Promise<NextResponse>
): Promise<NextResponse> {
  // Require authentication first
  const authResult = await requireAuth()
  if (authResult.error) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  const { supabase, tenant_id } = authResult

  // Check if tenant has reached limit
  const limitCheck = await checkLimit(tenant_id, metric, supabase)

  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `${metric.replace('_', ' ')} limit reached`,
        limit_reached: true,
        limit: limitCheck.limit,
        current: limitCheck.current,
        plan_name: limitCheck.plan_name,
        upgrade_url: limitCheck.upgrade_url
      },
      { status: 403 }
    )
  }

  // Execute the handler
  const response = await handler(request, authResult)

  // If operation succeeded (2xx status), track usage
  if (response.status >= 200 && response.status < 300) {
    // Track usage asynchronously (don't await to avoid slowing down response)
    trackUsage(tenant_id, metric, 1, supabase).catch(err => {
      console.error('Failed to track usage:', err)
    })
  }

  return response
}

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
