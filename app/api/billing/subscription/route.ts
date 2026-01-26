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

    // Mock subscription based on current features
    // This is a simplified version - in production you'd have a real subscriptions table
    return NextResponse.json({
      success: true,
      subscription: {
        plan_name: 'Professional',
        plan_slug: 'professional',
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
