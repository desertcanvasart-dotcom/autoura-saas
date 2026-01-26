import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/billing/usage
 * Get current billing period usage statistics
 */
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult

    // Check if tenant exists
    if (!tenant_id) {
      return NextResponse.json({
        success: false,
        error: 'Tenant not found'
      }, { status: 404 })
    }

    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed'
      }, { status: 500 })
    }

    // Get subscription with plan limits
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select(`
        id,
        current_period_start,
        current_period_end,
        plan:subscription_plans(
          max_quotes_per_month,
          max_team_members,
          max_whatsapp_messages,
          max_gmail_accounts,
          max_storage_mb
        )
      `)
      .eq('tenant_id', tenant_id)
      .in('status', ['trialing', 'active'])
      .single()

    if (!subscription) {
      return NextResponse.json({
        success: false,
        error: 'No active subscription found'
      }, { status: 404 })
    }

    // Get current period usage
    const { data: usage } = await supabase
      .from('tenant_usage')
      .select('*')
      .eq('tenant_id', tenant_id)
      .gte('period_end', new Date().toISOString())
      .order('period_start', { ascending: false })
      .limit(1)
      .single()

    // Get team member count
    const { count: teamMembersCount } = await supabase
      .from('tenant_members')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)

    // Get Gmail accounts count
    const { data: members } = await supabase
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenant_id)

    let gmailAccountsCount = 0
    if (members && members.length > 0) {
      const { count } = await supabase
        .from('gmail_tokens')
        .select('*', { count: 'exact', head: true })
        .in('user_id', members.map(m => m.user_id))

      gmailAccountsCount = count || 0
    }

    // Handle plan being an array (from join)
    const plan = Array.isArray(subscription.plan) ? subscription.plan[0] : subscription.plan

    if (!plan) {
      return NextResponse.json({
        success: false,
        error: 'Subscription plan not found'
      }, { status: 404 })
    }

    const currentUsage = usage || {
      quotes_created: 0,
      whatsapp_messages_sent: 0,
      gmail_emails_fetched: 0,
      pdfs_generated: 0,
      api_calls: 0,
      storage_used: 0
    }

    // Calculate percentage used for each metric
    const calculatePercentage = (current: number, limit: number | null): number => {
      if (limit === null) return 0 // Unlimited
      if (limit === 0) return 100
      return Math.min(Math.round((current / limit) * 100), 100)
    }

    const usage_data = {
      period_start: subscription.current_period_start,
      period_end: subscription.current_period_end,

      quotes: {
        current: currentUsage.quotes_created || 0,
        limit: plan.max_quotes_per_month,
        percentage: calculatePercentage(currentUsage.quotes_created || 0, plan.max_quotes_per_month),
        is_unlimited: plan.max_quotes_per_month === null,
        is_near_limit: plan.max_quotes_per_month !== null &&
          (currentUsage.quotes_created || 0) >= (plan.max_quotes_per_month * 0.8),
        is_over_limit: plan.max_quotes_per_month !== null &&
          (currentUsage.quotes_created || 0) >= plan.max_quotes_per_month
      },

      whatsapp_messages: {
        current: currentUsage.whatsapp_messages_sent || 0,
        limit: plan.max_whatsapp_messages,
        percentage: calculatePercentage(currentUsage.whatsapp_messages_sent || 0, plan.max_whatsapp_messages),
        is_unlimited: plan.max_whatsapp_messages === null,
        is_near_limit: plan.max_whatsapp_messages !== null &&
          (currentUsage.whatsapp_messages_sent || 0) >= (plan.max_whatsapp_messages * 0.8),
        is_over_limit: plan.max_whatsapp_messages !== null &&
          (currentUsage.whatsapp_messages_sent || 0) >= plan.max_whatsapp_messages
      },

      team_members: {
        current: teamMembersCount || 0,
        limit: plan.max_team_members,
        percentage: calculatePercentage(teamMembersCount || 0, plan.max_team_members),
        is_unlimited: plan.max_team_members === null,
        is_near_limit: plan.max_team_members !== null &&
          (teamMembersCount || 0) >= (plan.max_team_members * 0.8),
        is_over_limit: plan.max_team_members !== null &&
          (teamMembersCount || 0) >= plan.max_team_members
      },

      gmail_accounts: {
        current: gmailAccountsCount,
        limit: plan.max_gmail_accounts,
        percentage: calculatePercentage(gmailAccountsCount, plan.max_gmail_accounts),
        is_unlimited: plan.max_gmail_accounts === null,
        is_near_limit: plan.max_gmail_accounts !== null &&
          gmailAccountsCount >= (plan.max_gmail_accounts * 0.8),
        is_over_limit: plan.max_gmail_accounts !== null &&
          gmailAccountsCount >= plan.max_gmail_accounts
      },

      storage: {
        current: currentUsage.storage_used || 0,
        limit: plan.max_storage_mb,
        percentage: calculatePercentage(currentUsage.storage_used || 0, plan.max_storage_mb),
        is_unlimited: plan.max_storage_mb === null,
        is_near_limit: plan.max_storage_mb !== null &&
          (currentUsage.storage_used || 0) >= (plan.max_storage_mb * 0.8),
        is_over_limit: plan.max_storage_mb !== null &&
          (currentUsage.storage_used || 0) >= plan.max_storage_mb
      },

      // Additional metrics (no limits)
      gmail_emails_fetched: currentUsage.gmail_emails_fetched || 0,
      pdfs_generated: currentUsage.pdfs_generated || 0,
      api_calls: currentUsage.api_calls || 0
    }

    // Check if any limits are reached
    const limits_reached = {
      quotes: usage_data.quotes.is_over_limit,
      whatsapp_messages: usage_data.whatsapp_messages.is_over_limit,
      team_members: usage_data.team_members.is_over_limit,
      gmail_accounts: usage_data.gmail_accounts.is_over_limit,
      storage: usage_data.storage.is_over_limit
    }

    const any_limit_reached = Object.values(limits_reached).some(v => v)

    return NextResponse.json({
      success: true,
      usage: usage_data,
      limits_reached,
      any_limit_reached,
      upgrade_recommended: any_limit_reached ||
        usage_data.quotes.is_near_limit ||
        usage_data.whatsapp_messages.is_near_limit ||
        usage_data.team_members.is_near_limit
    })
  } catch (error: any) {
    console.error('Error fetching usage:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
