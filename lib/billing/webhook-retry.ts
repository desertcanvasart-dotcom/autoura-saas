// ============================================
// Which Stripe events may simply run again after a failure
// ============================================
// The webhook claims each event before handling it, so a replay cannot
// double-charge. On a failure the claim used to stay for EVERY event — so a
// passing database error on a subscription update was never retried and the
// company's plan stayed out of step with Stripe until someone noticed.
//
// These handlers only write state that a second run writes the same way
// (upserts, status updates, an activity line): their claim is released on
// failure and Stripe's retry re-runs them. Anything that creates or removes
// something at Stripe (trial_will_end raises the onboarding fee;
// subscription.deleted withdraws it) keeps its claim and waits for a person.

export const RETRY_SAFE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'invoice.paid',
  'invoice.payment_failed',
] as const

export function isRetrySafeEvent(type: string): boolean {
  return (RETRY_SAFE_EVENTS as readonly string[]).includes(type)
}
