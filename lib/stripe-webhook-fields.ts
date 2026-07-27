import type Stripe from 'stripe'

// ============================================================================
// READING STRIPE WEBHOOK PAYLOADS ACROSS API VERSIONS
// ============================================================================
// Stripe moved two fields, and because the webhook read them through `as any`
// the compiler said nothing:
//
//   Subscription.current_period_start/end  ->  SubscriptionItem.current_period_*
//   Invoice.subscription                   ->  Invoice.parent.subscription_details.subscription
//
// The damage was silent and total. `undefined * 1000` is NaN, and
// `new Date(NaN).toISOString()` THROWS — so handleSubscriptionUpdate died
// before its write on every single event: no subscription was ever recorded,
// which meant the onboarding fee could never find a row to charge against.
// The invoice handlers failed more quietly still: `.eq(col, undefined)` matches
// nothing, so payment history stayed empty and a failed card never flipped a
// tenant to past_due — they kept paid access indefinitely.
//
// So this module exists to make those reads EXPLICIT, VERSION-TOLERANT and
// TESTED. Two rules it enforces:
//
//   1. Never produce an invalid Date. A field that cannot be resolved returns
//      null, and callers must decide — never `new Date(undefined * 1000)`.
//   2. Accept both shapes. Stripe replays historical events using the API
//      version in force when they were created, so a payload from before the
//      move can still arrive today. Reading only the new location would
//      re-break the same handlers on exactly the events we most want.

/** A billing period. Both ends are unix seconds, and both are always present. */
export interface BillingPeriod {
  startIso: string
  endIso: string
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Unix seconds -> ISO string, or null if the input cannot make a valid date.
 * The null is the point: it forces the caller to handle the gap instead of
 * writing `Invalid Date` into a NOT NULL column or throwing mid-handler.
 */
export function unixToIso(seconds: unknown): string | null {
  if (!isFiniteNumber(seconds)) return null
  const ms = seconds * 1000
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * The subscription's current billing period.
 *
 * Current API versions carry it per ITEM; older payloads carry it on the
 * subscription. Items win when present, and we take the widest span across
 * items so a multi-item subscription reports the full period rather than
 * whichever item happened to be first.
 */
export function subscriptionPeriod(
  subscription: Stripe.Subscription
): BillingPeriod | null {
  const items = subscription.items?.data ?? []

  const starts: number[] = []
  const ends: number[] = []
  for (const item of items) {
    const it = item as unknown as Record<string, unknown>
    if (isFiniteNumber(it.current_period_start)) starts.push(it.current_period_start)
    if (isFiniteNumber(it.current_period_end)) ends.push(it.current_period_end)
  }

  // Fall back to the pre-move location for replayed historical events.
  const legacy = subscription as unknown as Record<string, unknown>
  const start = starts.length ? Math.min(...starts) : legacy.current_period_start
  const end = ends.length ? Math.max(...ends) : legacy.current_period_end

  const startIso = unixToIso(start)
  const endIso = unixToIso(end)
  if (!startIso || !endIso) return null

  return { startIso, endIso }
}

/**
 * The subscription id an invoice belongs to.
 *
 * Now nested under `parent.subscription_details`; previously a top-level
 * `subscription` field. Either may be an id or an expanded object.
 */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as Record<string, any>

  const fromParent = inv.parent?.subscription_details?.subscription
  const id = asId(fromParent) ?? asId(inv.subscription)
  return id
}

/** A Stripe reference is either the id string or the expanded object. */
function asId(ref: unknown): string | null {
  if (typeof ref === 'string' && ref) return ref
  if (ref && typeof ref === 'object') {
    const maybe = (ref as { id?: unknown }).id
    if (typeof maybe === 'string' && maybe) return maybe
  }
  return null
}

/** The payment intent on an invoice — same expanded-or-id treatment. */
export function invoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as Record<string, any>
  return asId(inv.payments?.data?.[0]?.payment?.payment_intent) ?? asId(inv.payment_intent)
}

/**
 * Total tax on an invoice, in cents.
 *
 * A third field that moved in the same version bump: `Invoice.tax` became the
 * `total_taxes[]` array. This one failed quietly rather than loudly — the old
 * read was `(inv.tax || 0) / 100`, so every billing invoice recorded tax as
 * ZERO instead of crashing. Worth fixing precisely because nothing would ever
 * have surfaced it.
 */
export function invoiceTaxCents(invoice: Stripe.Invoice): number {
  const inv = invoice as unknown as Record<string, any>

  const totals = inv.total_taxes
  if (Array.isArray(totals)) {
    return totals.reduce((sum: number, t: unknown) => {
      const amount = (t as { amount?: unknown })?.amount
      return sum + (isFiniteNumber(amount) ? amount : 0)
    }, 0)
  }

  return isFiniteNumber(inv.tax) ? inv.tax : 0
}
