import { describe, it, expect } from 'vitest'
import {
  decideOnboardingFee,
  chargedMetadata,
  pendingInvoiceItemToCancel,
  CHARGED_AT_KEY,
  INVOICE_ITEM_KEY,
} from '@/lib/onboarding-fee'
import { PRICING_TIERS, TIER_ORDER } from '@/lib/pricing-config'

// ============================================================================
// This decides a real $500-$1,500 charge. The rule that matters most is that
// it happens ONCE, ever — webhooks retry, and customer.subscription.trial_will_end
// can be redelivered. A duplicate here is money taken twice.
// ============================================================================

describe('the configured fees', () => {
  it('matches the operator decision of 2026-07-27', () => {
    expect(PRICING_TIERS.solo.onboardingFeeUsd).toBe(500)
    expect(PRICING_TIERS.studio.onboardingFeeUsd).toBe(1000)
    expect(PRICING_TIERS.agency.onboardingFeeUsd).toBe(1500)
    // Enterprise onboarding is scoped in the sales conversation, like its price.
    expect(PRICING_TIERS.enterprise.onboardingFeeUsd).toBeNull()
  })

  it('never carries a fee without a price, or a price without a decision', () => {
    for (const key of TIER_ORDER) {
      const t = PRICING_TIERS[key]
      if (t.onboardingFeeUsd !== null) {
        expect(t.onboardingFeeUsd, key).toBeGreaterThan(0)
        expect(t.monthlyPrice, key).not.toBeNull()
      }
    }
  })
})

describe('decideOnboardingFee — charges', () => {
  it('charges the plan’s fee in dollars and cents', () => {
    const d = decideOnboardingFee('studio', null)
    expect(d.charge).toBe(true)
    expect(d.amountUsd).toBe(1000)
    expect(d.amountCents).toBe(100000)
    expect(d.reason).toBe('charge')
    expect(d.description).toContain('Studio')
  })

  it('charges each priced tier its own amount', () => {
    expect(decideOnboardingFee('solo', {}).amountCents).toBe(50000)
    expect(decideOnboardingFee('studio', {}).amountCents).toBe(100000)
    expect(decideOnboardingFee('agency', {}).amountCents).toBe(150000)
  })
})

describe('decideOnboardingFee — refuses', () => {
  it('NEVER charges twice, whatever the plan says now', () => {
    // The guard is checked before the plan, because a tenant can change plan
    // mid-trial and a webhook can be redelivered.
    const already = { [CHARGED_AT_KEY]: '2026-07-27T10:00:00.000Z' }
    for (const slug of ['solo', 'studio', 'agency', 'enterprise', 'nonsense']) {
      const d = decideOnboardingFee(slug, already)
      expect(d.charge, slug).toBe(false)
      expect(d.reason, slug).toBe('already_charged')
    }
  })

  it('does not charge a plan with no fee', () => {
    const d = decideOnboardingFee('enterprise', {})
    expect(d.charge).toBe(false)
    expect(d.reason).toBe('no_fee_for_plan')
  })

  it('refuses an unknown plan rather than guessing an amount', () => {
    for (const slug of ['business', 'starter', '', null, undefined]) {
      const d = decideOnboardingFee(slug as string, {})
      expect(d.charge, String(slug)).toBe(false)
      expect(d.reason, String(slug)).toBe('unknown_plan')
    }
  })

  it('returns no amount at all when it refuses', () => {
    for (const d of [
      decideOnboardingFee('enterprise', {}),
      decideOnboardingFee('nope', {}),
      decideOnboardingFee('solo', { [CHARGED_AT_KEY]: 'x' }),
    ]) {
      expect(d.amountUsd).toBeNull()
      expect(d.amountCents).toBeNull()
      expect(d.description).toBeNull()
    }
  })

  it('treats a falsy charged-at as not yet charged', () => {
    // An empty string or null must not be mistaken for a record of payment.
    for (const v of ['', null, undefined, 0, false]) {
      expect(decideOnboardingFee('solo', { [CHARGED_AT_KEY]: v }).charge, String(v)).toBe(true)
    }
  })
})

describe('chargedMetadata', () => {
  it('records the item and timestamp without losing existing keys', () => {
    const out = chargedMetadata({ grandfathered: true }, 'ii_123', '2026-07-27T12:00:00.000Z')
    expect(out.grandfathered).toBe(true)
    expect(out[CHARGED_AT_KEY]).toBe('2026-07-27T12:00:00.000Z')
    expect(out[INVOICE_ITEM_KEY]).toBe('ii_123')
  })

  it('produces metadata that immediately blocks a second charge', () => {
    const out = chargedMetadata(null, 'ii_1', new Date(0).toISOString())
    expect(decideOnboardingFee('agency', out).reason).toBe('already_charged')
  })
})

describe('pendingInvoiceItemToCancel', () => {
  it('returns the item id when one was recorded', () => {
    expect(pendingInvoiceItemToCancel({ [INVOICE_ITEM_KEY]: 'ii_abc' })).toBe('ii_abc')
  })

  it('returns null when there is nothing to withdraw', () => {
    for (const m of [null, undefined, {}, { [INVOICE_ITEM_KEY]: '' }, { [INVOICE_ITEM_KEY]: 42 }]) {
      expect(pendingInvoiceItemToCancel(m as Record<string, unknown>)).toBeNull()
    }
  })
})
