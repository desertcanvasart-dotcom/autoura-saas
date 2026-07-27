import { describe, it, expect } from 'vitest'
import type Stripe from 'stripe'
import {
  unixToIso,
  subscriptionPeriod,
  invoiceSubscriptionId,
  invoicePaymentIntentId,
  invoiceTaxCents,
} from '@/lib/stripe-webhook-fields'

// ============================================================================
// These tests exist because the original code read the pre-move field names
// through `as any`, so nothing — not the compiler, not a test, not a log —
// reported that the billing webhook had never once completed. The whole point
// is to assert against BOTH payload shapes and to prove no path can produce an
// invalid Date.
// ============================================================================

const sub = (over: Record<string, unknown>): Stripe.Subscription =>
  ({ id: 'sub_1', items: { data: [] }, ...over }) as unknown as Stripe.Subscription

const item = (start: unknown, end: unknown) =>
  ({ current_period_start: start, current_period_end: end })

const JAN = 1767225600 // 2026-01-01T00:00:00Z
const FEB = 1769904000 // 2026-02-01T00:00:00Z

describe('unixToIso — never yields an invalid date', () => {
  it('converts unix seconds', () => {
    expect(unixToIso(JAN)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns null for everything unusable, instead of throwing', () => {
    // `new Date(undefined * 1000).toISOString()` is the RangeError that killed
    // the handler before it could write.
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, '123', {}, []]) {
      expect(unixToIso(bad), String(bad)).toBeNull()
    }
  })

  it('accepts 0 (epoch) rather than treating it as missing', () => {
    expect(unixToIso(0)).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('subscriptionPeriod', () => {
  it('reads the CURRENT location: the subscription item', () => {
    const s = sub({ items: { data: [item(JAN, FEB)] } })
    expect(subscriptionPeriod(s)).toEqual({
      startIso: '2026-01-01T00:00:00.000Z',
      endIso: '2026-02-01T00:00:00.000Z',
    })
  })

  it('reads the LEGACY location when a replayed event carries it', () => {
    // Stripe replays historical events under the API version in force when
    // they were created, so this shape still arrives.
    const s = sub({ items: { data: [] }, current_period_start: JAN, current_period_end: FEB })
    expect(subscriptionPeriod(s)?.startIso).toBe('2026-01-01T00:00:00.000Z')
  })

  it('prefers items over the legacy field when both are present', () => {
    const s = sub({
      items: { data: [item(JAN, FEB)] },
      current_period_start: 1,
      current_period_end: 2,
    })
    expect(subscriptionPeriod(s)?.startIso).toBe('2026-01-01T00:00:00.000Z')
  })

  it('spans all items rather than trusting the first', () => {
    const s = sub({ items: { data: [item(FEB, FEB + 100), item(JAN, FEB)] } })
    expect(subscriptionPeriod(s)).toEqual({
      startIso: '2026-01-01T00:00:00.000Z',
      endIso: new Date((FEB + 100) * 1000).toISOString(),
    })
  })

  it('returns null — never a bad date — when the period is unresolvable', () => {
    // THE ORIGINAL BUG: this exact payload made the handler throw.
    expect(subscriptionPeriod(sub({ items: { data: [] } }))).toBeNull()
    expect(subscriptionPeriod(sub({ items: { data: [item(undefined, undefined)] } }))).toBeNull()
    expect(subscriptionPeriod(sub({ items: { data: [item(JAN, undefined)] } }))).toBeNull()
  })

  it('survives a payload with no items array at all', () => {
    expect(() => subscriptionPeriod({ id: 'sub_x' } as Stripe.Subscription)).not.toThrow()
    expect(subscriptionPeriod({ id: 'sub_x' } as Stripe.Subscription)).toBeNull()
  })
})

describe('invoiceSubscriptionId', () => {
  const inv = (over: Record<string, unknown>) => over as unknown as Stripe.Invoice

  it('reads the CURRENT location: parent.subscription_details', () => {
    expect(invoiceSubscriptionId(inv({
      parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_9' } },
    }))).toBe('sub_9')
  })

  it('reads the LEGACY top-level field', () => {
    expect(invoiceSubscriptionId(inv({ subscription: 'sub_legacy' }))).toBe('sub_legacy')
  })

  it('handles an expanded subscription object in either position', () => {
    expect(invoiceSubscriptionId(inv({
      parent: { subscription_details: { subscription: { id: 'sub_exp' } } },
    }))).toBe('sub_exp')
    expect(invoiceSubscriptionId(inv({ subscription: { id: 'sub_exp2' } }))).toBe('sub_exp2')
  })

  it('returns null for a one-off invoice with no subscription', () => {
    // Must be null, not undefined: `.eq(col, undefined)` silently matches
    // nothing, which is how the empty payment history went unnoticed.
    for (const payload of [{}, { subscription: null }, { parent: null }, { parent: { subscription_details: null } }]) {
      expect(invoiceSubscriptionId(inv(payload))).toBeNull()
    }
  })
})

describe('invoicePaymentIntentId', () => {
  const inv = (over: Record<string, unknown>) => over as unknown as Stripe.Invoice

  it('reads both the current payments[] location and the legacy field', () => {
    expect(invoicePaymentIntentId(inv({
      payments: { data: [{ payment: { payment_intent: 'pi_new' } }] },
    }))).toBe('pi_new')
    expect(invoicePaymentIntentId(inv({ payment_intent: 'pi_old' }))).toBe('pi_old')
    expect(invoicePaymentIntentId(inv({}))).toBeNull()
  })
})

describe('invoiceTaxCents — the quiet drift', () => {
  const inv = (over: Record<string, unknown>) => over as unknown as Stripe.Invoice

  it('sums the CURRENT total_taxes array', () => {
    expect(invoiceTaxCents(inv({ total_taxes: [{ amount: 250 }, { amount: 125 }] }))).toBe(375)
  })

  it('reads the LEGACY flat field', () => {
    expect(invoiceTaxCents(inv({ tax: 400 }))).toBe(400)
  })

  it('is 0 for an untaxed invoice, and never NaN', () => {
    for (const payload of [{}, { tax: null }, { total_taxes: null }, { total_taxes: [] }, { total_taxes: [{}] }]) {
      const v = invoiceTaxCents(inv(payload))
      expect(Number.isFinite(v), JSON.stringify(payload)).toBe(true)
      expect(v).toBe(0)
    }
  })
})
