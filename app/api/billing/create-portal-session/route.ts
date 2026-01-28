import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createPortalSession } from '@/lib/stripe'

/**
 * POST /api/billing/create-portal-session
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Only owners can manage billing
    const { data: member } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'owner') {
      return NextResponse.json({
        success: false,
        error: 'Only tenant owners can manage billing'
      }, { status: 403 })
    }

    // Get tenant subscription
    const { data: subscription, error: subError } = await supabase
      .from('tenant_subscriptions')
      .select('stripe_customer_id')
      .eq('tenant_id', tenant_id)
      .single()

    if (subError || !subscription) {
      return NextResponse.json({
        success: false,
        error: 'No active subscription found. Please subscribe to a plan first.'
      }, { status: 404 })
    }

    // Create portal session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const returnUrl = `${appUrl}/admin/billing`

    const session = await createPortalSession(
      subscription.stripe_customer_id,
      returnUrl
    )

    return NextResponse.json({
      success: true,
      portal_url: session.url
    })
  } catch (error: any) {
    console.error('Error creating portal session:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
