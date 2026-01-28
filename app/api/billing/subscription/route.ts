import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/billing/subscription
 * Get current tenant subscription details
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
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

    // For now, return a mock subscription based on tenant_features
    // In production, this would query the actual subscription table
    const { data: features } = await supabase
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single()

    if (!features) {
      return NextResponse.json({
        success: true,
        subscription: null,
        has_subscription: false,
        message: 'No active subscription'
      })
    }

    // Return subscription based on current tenant features
    const currentTier = features.current_pricing_tier || 'professional'

    // Format plan name from tier slug
    const planName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1)

    return NextResponse.json({
      success: true,
      subscription: {
        plan_name: planName,
        plan_slug: currentTier,
        status: 'active'
      },
      has_subscription: true
    })
  } catch (error: any) {
    console.error('Error fetching subscription:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
