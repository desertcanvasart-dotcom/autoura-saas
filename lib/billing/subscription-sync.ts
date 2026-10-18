// ============================================
// Which Stripe subscription state a company's row may take
// ============================================
// Stripe does not deliver events in order, and a company can briefly have two
// subscriptions (a double-clicked checkout, re-subscribing while the old one
// is still dunning). The row is one per company, so:
//   * handlers sync from the subscription as Stripe has it NOW, not the
//     event's snapshot — a late `updated` cannot roll the row back;
//   * a subscription that is ending never overwrites a DIFFERENT, live one —
//     the old subscription dying must not mark a paying company canceled.

/** Statuses during which the company still has a subscription on the go. */
export const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused'] as const

export function isLive(status: string | null | undefined): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(String(status ?? ''))
}

/**
 * Whether `incoming` (a subscription's current state) may be written over the
 * company's row `existing`.
 */
export function shouldApplySubscription(
  existing: { stripe_subscription_id: string | null; status: string | null } | null,
  incoming: { id: string; status: string },
): boolean {
  if (!existing || !existing.stripe_subscription_id) return true
  if (existing.stripe_subscription_id === incoming.id) return true
  // A different subscription: it may replace the row's one only when that
  // one is over, or when it is itself live (a genuine re-subscription).
  return !isLive(existing.status) || isLive(incoming.status)
}
