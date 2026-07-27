// ============================================
// ONE-TIME ONBOARDING FEE — charged on conversion
// ============================================
// Operator decision 2026-07-27: the fee is charged when a trial converts to a
// paid subscription, NOT at signup.
//
// Why not at signup: adding it to the Checkout session creates an amount due
// immediately, and Stripe then requires a payment method regardless of
// `payment_method_collection: 'if_required'` — which would break the "no card
// required to start" promise at the exact moment it is tested.
//
// So the fee is created as a PENDING INVOICE ITEM when Stripe fires
// `customer.subscription.trial_will_end` (three days out). Stripe attaches
// pending items to the customer's next invoice, and with a trial that invoice
// is the first real one — so the fee lands on the same bill as the first
// subscription charge, and nothing is owed until the operator decides to
// continue.
//
// The money rules this file exists to enforce:
//   * charge ONCE per tenant, ever — a duplicate here is a real $500-$1,500
//   * never charge a plan with no fee (Enterprise is scoped in sales)
//   * never charge on an unrecognised plan rather than guessing an amount

import { PRICING_TIERS } from './pricing-config'

/** Set on tenant_subscriptions.metadata once the fee has been raised. */
export const CHARGED_AT_KEY = 'onboarding_fee_charged_at'
/** The Stripe invoice item id, kept so it can be withdrawn if the trial is abandoned. */
export const INVOICE_ITEM_KEY = 'onboarding_fee_invoice_item'

export type OnboardingFeeReason =
  | 'charge'
  | 'already_charged'
  | 'no_fee_for_plan'
  | 'unknown_plan'

export interface OnboardingFeeDecision {
  charge: boolean
  /** USD. Present only when charge is true. */
  amountUsd: number | null
  /** Cents, for Stripe. Present only when charge is true. */
  amountCents: number | null
  reason: OnboardingFeeReason
  /** Operator-facing line on the invoice. */
  description: string | null
}

const NO = (reason: OnboardingFeeReason): OnboardingFeeDecision => ({
  charge: false,
  amountUsd: null,
  amountCents: null,
  reason,
  description: null,
})

/**
 * Decide whether to raise the onboarding fee for a subscription that is about
 * to leave its trial.
 *
 * `metadata` is the tenant_subscriptions.metadata jsonb. It is the durable
 * record: Stripe idempotency keys expire after 24 hours, which is far too
 * short to protect a once-ever charge.
 */
export function decideOnboardingFee(
  planSlug: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): OnboardingFeeDecision {
  // Checked first: an already-charged tenant must never be re-charged, whatever
  // its plan says now. Webhooks retry, and a plan can change mid-trial.
  if (metadata && metadata[CHARGED_AT_KEY]) return NO('already_charged')

  if (!planSlug) return NO('unknown_plan')
  const tier = PRICING_TIERS[planSlug]
  if (!tier) return NO('unknown_plan')

  const fee = tier.onboardingFeeUsd
  if (fee === null || fee === undefined) return NO('no_fee_for_plan')

  // A non-positive or non-finite fee is bad configuration, not a free
  // onboarding. Refuse rather than raise a €0 line item.
  if (!Number.isFinite(fee) || fee <= 0) return NO('no_fee_for_plan')

  return {
    charge: true,
    amountUsd: fee,
    amountCents: Math.round(fee * 100),
    reason: 'charge',
    description: `One-time onboarding — ${tier.name}`,
  }
}

/** Metadata to merge onto tenant_subscriptions once the item is raised. */
export function chargedMetadata(
  existing: Record<string, unknown> | null | undefined,
  invoiceItemId: string,
  chargedAtIso: string
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [CHARGED_AT_KEY]: chargedAtIso,
    [INVOICE_ITEM_KEY]: invoiceItemId,
  }
}

/**
 * The pending invoice item to withdraw when a trial is abandoned.
 *
 * Without this, a tenant who cancels after the item is raised but before the
 * first invoice leaves a charge sitting on their Stripe customer, which would
 * attach to any future invoice — including one raised months later if they came
 * back. Returns null when there is nothing to withdraw.
 */
export function pendingInvoiceItemToCancel(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const id = metadata?.[INVOICE_ITEM_KEY]
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Clear the charged markers after a fee was WITHDRAWN un-invoiced.
 *
 * Without this the flags outlive the charge: the tenant abandons the trial, the
 * Stripe item is deleted, but `onboarding_fee_charged_at` stays set. If they
 * subscribe again months later, decideOnboardingFee() short-circuits on
 * `already_charged` and the fee is never collected — while the log line reads
 * "skipped (already_charged)", which looks like correct behaviour. Revenue
 * quietly lost, with a reassuring message.
 */
export function clearedMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  delete next[CHARGED_AT_KEY]
  delete next[INVOICE_ITEM_KEY]
  return next
}
