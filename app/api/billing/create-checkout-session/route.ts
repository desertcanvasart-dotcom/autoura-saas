import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { getOrCreateStripeCustomer, createCheckoutSession } from '@/lib/stripe'
import { logActivity } from '@/lib/billing-middleware'

/**
 * POST /api/billing/create-checkout-session
 * Create a Stripe Checkout session for subscribing to a plan
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

    // Get tenant details for Stripe customer
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('company_name, contact_email')
      .eq('id', tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({
        success: false,
        error: 'Tenant not found'
      }, { status: 404 })
    }

    const body = await request.json()
    const { plan_slug, billing_cycle = 'monthly' } = body

    if (!plan_slug) {
      return NextResponse.json({
        success: false,
        error: 'plan_slug is required'
      }, { status: 400 })
    }

    if (!['monthly', 'yearly'].includes(billing_cycle)) {
      return NextResponse.json({
        success: false,
        error: 'billing_cycle must be "monthly" or "yearly"'
      }, { status: 400 })
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json({
        success: false,
        error: 'Invalid plan selected'
      }, { status: 404 })
    }

    // Get the appropriate Stripe price ID
    const priceId = billing_cycle === 'monthly'
      ? plan.stripe_price_id_monthly
      : plan.stripe_price_id_yearly

    if (!priceId) {
      return NextResponse.json({
        success: false,
        error: 'Stripe price ID not configured for this plan and billing cycle'
      }, { status: 500 })
    }

    // Check if tenant already has an active subscription
    const { data: existingSub } = await supabase
      .from('tenant_subscriptions')
      .select('id, status')
      .eq('tenant_id', tenant_id)
      .in('status', ['active', 'trialing'])
      .single()

    if (existingSub) {
      return NextResponse.json({
        success: false,
        error: 'Tenant already has an active subscription. Use the billing portal to change plans.'
      }, { status: 400 })
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      tenant_id,
      tenant.company_name,
      tenant.contact_email,
      supabase
    )

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const successUrl = `${appUrl}/admin/billing?success=true&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${appUrl}/admin/billing/plans?canceled=true`

    const session = await createCheckoutSession(
      customerId,
      priceId,
      tenant_id,
      successUrl,
      cancelUrl
    )

    // Log activity
    await logActivity(
      tenant_id,
      user.id,
      'billing.checkout_started',
      supabase,
      {
        details: {
          plan_slug,
          billing_cycle,
          plan_name: plan.name
        }
      }
    )

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
      session_id: session.id
    })
  } catch (error: any) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
