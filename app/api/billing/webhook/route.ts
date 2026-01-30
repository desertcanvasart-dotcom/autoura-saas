import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { verifyWebhookSignature } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 * This endpoint is called by Stripe to sync subscription and payment events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      console.error('Missing Stripe signature')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = verifyWebhookSignature(body, signature, webhookSecret)
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      )
    }

    console.log(`Received Stripe webhook event: ${event.type}`)

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/**
 * Handle successful checkout session
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const tenantId = session.metadata?.tenant_id
  const subscriptionId = session.subscription as string

  if (!tenantId || !subscriptionId) {
    console.error('Missing tenant_id or subscription in checkout session')
    return
  }

  console.log(`Checkout completed for tenant ${tenantId}, subscription ${subscriptionId}`)

  // The actual subscription will be handled by subscription.created event
  // Just log the activity here
  await getSupabaseAdmin().rpc('log_activity', {
    p_tenant_id: tenantId,
    p_user_id: null,
    p_action_type: 'billing.checkout_completed',
    p_details: {
      subscription_id: subscriptionId,
      customer_id: session.customer
    }
  })
}

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  // Cast to any for accessing properties that may not be in TypeScript types
  const sub = subscription as any
  const tenantId = subscription.metadata?.tenant_id
  const customerId = subscription.customer as string

  if (!tenantId) {
    console.error('Missing tenant_id in subscription metadata')
    return
  }

  console.log(`Updating subscription ${subscription.id} for tenant ${tenantId}`)

  // Get the plan from Stripe price ID
  const priceId = subscription.items.data[0]?.price.id

  const { data: plan } = await getSupabaseAdmin()
    .from('subscription_plans')
    .select('id')
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
    .single()

  if (!plan) {
    console.error(`No plan found for price ID: ${priceId}`)
    return
  }

  const billingCycle = subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'yearly' : 'monthly'

  // Upsert subscription
  const { error } = await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .upsert({
      tenant_id: tenantId,
      plan_id: plan.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      billing_cycle: billingCycle,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      ends_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'tenant_id'
    })

  if (error) {
    console.error('Error upserting subscription:', error)
    return
  }

  // Create or update usage tracking record for new period
  const { data: subscriptionRecord } = await getSupabaseAdmin()
    .from('tenant_subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .single()

  if (subscriptionRecord) {
    await (getSupabaseAdmin() as any)
      .from('tenant_usage')
      .upsert({
        tenant_id: tenantId,
        subscription_id: subscriptionRecord.id,
        period_start: new Date(sub.current_period_start * 1000).toISOString(),
        period_end: new Date(sub.current_period_end * 1000).toISOString(),
        quotes_created: 0,
        whatsapp_messages_sent: 0,
        gmail_emails_fetched: 0,
        pdfs_generated: 0,
        api_calls: 0,
        storage_used: 0
      }, {
        onConflict: 'tenant_id,period_start'
      })
  }

  console.log(`Successfully updated subscription for tenant ${tenantId}`)
}

/**
 * Handle subscription canceled/deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata?.tenant_id

  if (!tenantId) {
    console.error('Missing tenant_id in subscription metadata')
    return
  }

  console.log(`Subscription deleted for tenant ${tenantId}`)

  // Update subscription status
  const { error } = await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('Error updating canceled subscription:', error)
    return
  }

  // Log activity
  await getSupabaseAdmin().rpc('log_activity', {
    p_tenant_id: tenantId,
    p_user_id: null,
    p_action_type: 'billing.subscription_canceled',
    p_details: {
      subscription_id: subscription.id
    }
  })
}

/**
 * Handle successful payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const inv = invoice as any
  const customerId = invoice.customer as string
  const subscriptionId = inv.subscription as string

  // Get tenant from subscription
  const { data: subscription } = await getSupabaseAdmin()
    .from('tenant_subscriptions')
    .select('id, tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!subscription) {
    console.error(`No subscription found for invoice ${invoice.id}`)
    return
  }

  console.log(`Invoice paid for tenant ${subscription.tenant_id}`)

  // Store invoice record
  await (getSupabaseAdmin() as any)
    .from('billing_invoices')
    .upsert({
      tenant_id: subscription.tenant_id,
      subscription_id: subscription.id,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: inv.payment_intent as string,
      invoice_number: invoice.number || null,
      amount_due: invoice.amount_due / 100,
      amount_paid: invoice.amount_paid / 100,
      currency: invoice.currency,
      tax: (inv.tax || 0) / 100,
      total: invoice.total / 100,
      status: invoice.status || 'paid',
      invoice_date: new Date(invoice.created * 1000).toISOString(),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
      invoice_pdf_url: invoice.invoice_pdf || null,
      hosted_invoice_url: invoice.hosted_invoice_url || null,
      line_items: invoice.lines?.data || null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'stripe_invoice_id'
    })

  // Log activity
  await getSupabaseAdmin().rpc('log_activity', {
    p_tenant_id: subscription.tenant_id,
    p_user_id: null,
    p_action_type: 'billing.payment_succeeded',
    p_details: {
      invoice_id: invoice.id,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency
    }
  })
}

/**
 * Handle failed payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as any
  const subscriptionId = inv.subscription as string

  // Get tenant from subscription
  const { data: subscription } = await getSupabaseAdmin()
    .from('tenant_subscriptions')
    .select('id, tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!subscription) {
    console.error(`No subscription found for invoice ${invoice.id}`)
    return
  }

  console.log(`Payment failed for tenant ${subscription.tenant_id}`)

  // Update subscription status to past_due
  await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('id', subscription.id)

  // Log activity
  await getSupabaseAdmin().rpc('log_activity', {
    p_tenant_id: subscription.tenant_id,
    p_user_id: null,
    p_action_type: 'billing.payment_failed',
    p_details: {
      invoice_id: invoice.id,
      amount: invoice.amount_due / 100,
      currency: invoice.currency
    }
  })

  // TODO: Send email notification to tenant owner about failed payment
}

/**
 * Handle trial ending soon
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const sub = subscription as any
  const tenantId = subscription.metadata?.tenant_id

  if (!tenantId) {
    console.error('Missing tenant_id in subscription metadata')
    return
  }

  console.log(`Trial ending soon for tenant ${tenantId}`)

  // Log activity
  await getSupabaseAdmin().rpc('log_activity', {
    p_tenant_id: tenantId,
    p_user_id: null,
    p_action_type: 'billing.trial_ending_soon',
    p_details: {
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null
    }
  })

  // TODO: Send email notification to tenant owner about trial ending
}
