import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { verifyWebhookSignature } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  decideOnboardingFee,
  chargedMetadata,
  pendingInvoiceItemToCancel,
} from '@/lib/onboarding-fee'

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



  // The actual subscription will be handled by subscription.created event
  // Just log the activity here
  await (getSupabaseAdmin() as any).rpc('log_activity', {
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



  // Get the plan from Stripe price ID
  const priceId = subscription.items.data[0]?.price.id

  const { data: plan } = await (getSupabaseAdmin() as any)
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
  const { data: subscriptionRecord } = await (getSupabaseAdmin() as any)
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



  await withdrawUninvoicedOnboardingFee(subscription)

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
  await (getSupabaseAdmin() as any).rpc('log_activity', {
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
  const subscriptionId = inv.subscription as string

  // Get tenant from subscription
  const { data: subscription } = await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .select('id, tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!subscription) {
    console.error(`No subscription found for invoice ${invoice.id}`)
    return
  }



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
  await (getSupabaseAdmin() as any).rpc('log_activity', {
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
  const { data: subscription } = await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .select('id, tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!subscription) {
    console.error(`No subscription found for invoice ${invoice.id}`)
    return
  }



  // Update subscription status to past_due
  await (getSupabaseAdmin() as any)
    .from('tenant_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('id', subscription.id)

  // Log activity
  await (getSupabaseAdmin() as any).rpc('log_activity', {
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



  // Log activity
  await (getSupabaseAdmin() as any).rpc('log_activity', {
    p_tenant_id: tenantId,
    p_user_id: null,
    p_action_type: 'billing.trial_ending_soon',
    p_details: {
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null
    }
  })

  await raiseOnboardingFee(tenantId, subscription)

  // TODO: Send email notification to tenant owner about trial ending
}

/*
 * The shared admin client is untyped in this file — every query above casts it
 * inline. One scoped accessor for the onboarding-fee helpers instead, so the
 * escape hatch is declared once with a reason rather than repeated.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client; row shapes are asserted at each use */
const admin = () => getSupabaseAdmin() as any

/**
 * Raise the one-time onboarding fee as a PENDING invoice item, so it lands on
 * the first real invoice rather than at signup.
 *
 * Charged on conversion by operator decision: putting it in the Checkout
 * session would create an amount due immediately, and Stripe would then demand
 * a card despite payment_method_collection: 'if_required' — breaking the "no
 * card required to start" promise.
 *
 * Idempotency is durable, in tenant_subscriptions.metadata, NOT a Stripe
 * idempotency key: those expire after 24 hours, which cannot protect a
 * once-ever charge of $500-$1,500. Failures are swallowed deliberately — a
 * fee that cannot be raised must never take the whole webhook down with it,
 * because the same event also keeps subscription state in sync.
 */
async function raiseOnboardingFee(tenantId: string, subscription: Stripe.Subscription) {
  try {
    const { data: row } = await admin()
      .from('tenant_subscriptions')
      .select('id, metadata, plan:subscription_plans(slug)')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle()

    if (!row) {
      console.error('onboarding fee: no subscription row for', subscription.id)
      return
    }

    const decision = decideOnboardingFee(row.plan?.slug, row.metadata)
    if (!decision.charge) {
      console.log(`onboarding fee: skipped (${decision.reason}) for tenant ${tenantId}`)
      return
    }

    const item = await stripe.invoiceItems.create({
      customer: subscription.customer as string,
      amount: decision.amountCents as number,
      currency: 'usd',
      description: decision.description as string,
      metadata: { tenant_id: tenantId, autoura_onboarding_fee: 'true' },
    })

    // Written immediately after creation. If this write fails the item exists
    // without a record, so the log below is the trail for reconciling it by
    // hand — far better than risking a second charge by writing first.
    const { error: metaError } = await admin()
      .from('tenant_subscriptions')
      .update({
        metadata: chargedMetadata(row.metadata, item.id, new Date().toISOString()),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (metaError) {
      console.error(
        `onboarding fee: RAISED ${item.id} for tenant ${tenantId} but failed to record it — ` +
        `a retry could double-charge. Reconcile manually.`, metaError
      )
      return
    }

    console.log(`onboarding fee: raised $${decision.amountUsd} (${item.id}) for tenant ${tenantId}`)
  } catch (err) {
    console.error('onboarding fee: could not raise for tenant', tenantId, err)
  }
}


/**
 * Withdraw the onboarding fee if the trial was abandoned before it was invoiced.
 *
 * The item is raised three days before trial end, so a cancellation inside that
 * window would otherwise leave a charge sitting on the Stripe customer — ready
 * to attach to any future invoice, including one raised months later if they
 * came back. Stripe refuses to delete an item that has already been invoiced,
 * which is exactly the behaviour wanted: a fee on a paid bill stays paid.
 */
async function withdrawUninvoicedOnboardingFee(subscription: Stripe.Subscription) {
  try {
    const { data: row } = await admin()
      .from('tenant_subscriptions')
      .select('metadata')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle()

    const itemId = pendingInvoiceItemToCancel(row?.metadata)
    if (!itemId) return

    await stripe.invoiceItems.del(itemId)
    console.log(`onboarding fee: withdrew uninvoiced item ${itemId}`)
  } catch (err) {
    // Already invoiced, or already gone. Neither is an error worth failing on.
    console.log('onboarding fee: nothing to withdraw', err instanceof Error ? err.message : err)
  }
}
