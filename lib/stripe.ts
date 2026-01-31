import Stripe from 'stripe'

// Lazy-initialized Stripe client (avoids build-time errors when env vars unavailable)
let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (!_stripe) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables')
    }
    _stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true
    })
  }
  return _stripe
}

// Export getter for backward compatibility
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as any)[prop]
  }
})

/**
 * Create or retrieve a Stripe customer for a tenant
 */
export async function getOrCreateStripeCustomer(
  tenantId: string,
  tenantName: string,
  tenantEmail: string | null,
  supabase: any
): Promise<string> {
  // Check if customer already exists
  const { data: existingSub } = await supabase
    .from('tenant_subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .single()

  if (existingSub?.stripe_customer_id) {
    return existingSub.stripe_customer_id
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    name: tenantName,
    email: tenantEmail || undefined,
    metadata: {
      tenant_id: tenantId
    }
  })

  return customer.id
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  tenantId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {
        tenant_id: tenantId
      },
      trial_period_days: 14 // 14-day free trial
    },
    allow_promotion_codes: true,
    metadata: {
      tenant_id: tenantId
    }
  })

  return session
}

/**
 * Create a billing portal session
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  })

  return session
}

/**
 * Get subscription by ID
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.retrieve(subscriptionId)
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<Stripe.Subscription> {
  if (immediately) {
    return await stripe.subscriptions.cancel(subscriptionId)
  } else {
    // Cancel at period end
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    })
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false
  })
}

/**
 * Update subscription to different plan
 */
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  return await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId
      }
    ],
    proration_behavior: 'create_prorations' // Prorate the charges
  })
}

/**
 * Get list of invoices for a customer
 */
export async function getCustomerInvoices(
  customerId: string,
  limit: number = 10
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit
  })

  return invoices.data
}

/**
 * Get upcoming invoice (preview)
 */
export async function getUpcomingInvoice(
  customerId: string
): Promise<Stripe.Invoice | null> {
  try {
    return await stripe.invoices.createPreview({
      customer: customerId
    })
  } catch (error: any) {
    // No upcoming invoice
    if (error.code === 'invoice_upcoming_none') {
      return null
    }
    throw error
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret)
}

/**
 * Format currency amount from Stripe (cents to dollars/euros)
 */
export function formatStripeAmount(amount: number, currency: string = 'eur'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amount / 100)
}
