import { describe, it, expect } from 'vitest'
import {
  PRICING_TIERS,
  TIER_ORDER,
  getTierLevel,
  compareTiers,
  getColorClasses,
} from '@/lib/pricing-config'
import type { PricingTier } from '@/lib/pricing-config'

// lib/pricing-config.ts is the static SaaS subscription-tier catalog (this is
// the platform's own pricing, not tour pricing). These tests lock the shape
// and internal consistency of the config — every number shown to a customer
// must come from this table, so a malformed entry (0 price, missing feature
// flag, tier not in TIER_ORDER) is a data bug we want to catch at test time.

const FEATURE_KEYS = [
  'b2c',
  'b2b',
  'whatsapp',
  'email',
  'pdf',
  'analytics',
  'customBranding',
  'apiAccess',
  'prioritySupport',
] as const

describe('PRICING_TIERS — catalog integrity', () => {
  it('contains exactly the four known tiers, keyed by their slug', () => {
    expect(Object.keys(PRICING_TIERS).sort()).toEqual(
      ['business', 'enterprise', 'professional', 'starter']
    )
    for (const [key, tier] of Object.entries(PRICING_TIERS)) {
      expect(tier.slug).toBe(key)
    }
  })

  it('every tier has strictly positive prices — no free/zero tier can appear by accident', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(tier.monthlyPrice).toBeGreaterThan(0)
      expect(tier.annualPrice).toBeGreaterThan(0)
      expect(Number.isFinite(tier.monthlyPrice)).toBe(true)
      expect(Number.isFinite(tier.annualPrice)).toBe(true)
    }
  })

  it('annual price is exactly 10 × monthly for every tier (2 months free)', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(tier.annualPrice).toBe(tier.monthlyPrice * 10)
    }
  })

  it('every tier carries all limit fields as positive numbers', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(tier.maxUsers).toBeGreaterThan(0)
      expect(tier.maxItinerariesPerMonth).toBeGreaterThan(0)
      expect(tier.maxQuotesPerMonth).toBeGreaterThan(0)
      expect(tier.maxPartners).toBeGreaterThan(0)
    }
  })

  it('every tier defines every feature flag as a boolean (no missing/undefined flags)', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      for (const key of FEATURE_KEYS) {
        expect(typeof tier.features[key], `${tier.slug}.features.${key}`).toBe('boolean')
      }
      expect(Object.keys(tier.features).sort()).toEqual([...FEATURE_KEYS].sort())
    }
  })

  it('exactly one tier is flagged popular (professional)', () => {
    const popular = Object.values(PRICING_TIERS).filter((t) => t.popular)
    expect(popular.map((t) => t.slug)).toEqual(['professional'])
  })

  it('locks the current price points', () => {
    expect(PRICING_TIERS.starter.monthlyPrice).toBe(49)
    expect(PRICING_TIERS.professional.monthlyPrice).toBe(149)
    expect(PRICING_TIERS.business.monthlyPrice).toBe(349)
    expect(PRICING_TIERS.enterprise.monthlyPrice).toBe(999)
  })

  it('locks the B2C/B2B feature split (business is B2B-only)', () => {
    expect(PRICING_TIERS.starter.features).toMatchObject({ b2c: true, b2b: false })
    expect(PRICING_TIERS.professional.features).toMatchObject({ b2c: true, b2b: true })
    expect(PRICING_TIERS.business.features).toMatchObject({ b2c: false, b2b: true })
    expect(PRICING_TIERS.enterprise.features).toMatchObject({ b2c: true, b2b: true })
  })
})

describe('TIER_ORDER — ordering defaults', () => {
  it('covers every catalog tier exactly once', () => {
    expect([...TIER_ORDER].sort()).toEqual(Object.keys(PRICING_TIERS).sort())
    expect(new Set(TIER_ORDER).size).toBe(TIER_ORDER.length)
  })

  it('is sorted by ascending price, and limits never shrink on upgrade', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const prev = PRICING_TIERS[TIER_ORDER[i - 1]]
      const next = PRICING_TIERS[TIER_ORDER[i]]
      expect(next.monthlyPrice).toBeGreaterThan(prev.monthlyPrice)
      expect(next.maxUsers).toBeGreaterThanOrEqual(prev.maxUsers)
      expect(next.maxItinerariesPerMonth).toBeGreaterThanOrEqual(prev.maxItinerariesPerMonth)
      expect(next.maxQuotesPerMonth).toBeGreaterThanOrEqual(prev.maxQuotesPerMonth)
      expect(next.maxPartners).toBeGreaterThanOrEqual(prev.maxPartners)
    }
  })
})

describe('getTierLevel', () => {
  it('maps known tiers to their position in TIER_ORDER', () => {
    expect(getTierLevel('starter')).toBe(0)
    expect(getTierLevel('professional')).toBe(1)
    expect(getTierLevel('business')).toBe(2)
    expect(getTierLevel('enterprise')).toBe(3)
  })

  it('returns -1 for unknown slugs — never invents a level', () => {
    expect(getTierLevel('platinum')).toBe(-1)
    expect(getTierLevel('')).toBe(-1)
    expect(getTierLevel('STARTER')).toBe(-1) // case-sensitive: slugs are lowercase
  })
})

describe('compareTiers', () => {
  it('classifies moves between known tiers', () => {
    expect(compareTiers('starter', 'business')).toBe('upgrade')
    expect(compareTiers('enterprise', 'professional')).toBe('downgrade')
    expect(compareTiers('professional', 'professional')).toBe('current')
    // adjacent boundaries
    expect(compareTiers('starter', 'professional')).toBe('upgrade')
    expect(compareTiers('professional', 'starter')).toBe('downgrade')
  })

  // DOCUMENTED intent: a tenant whose stored tier slug is stale/unrecognized
  // has no recognizable plan, so every real plan is presented as an upgrade
  // path (see the comment in compareTiers).
  it('unknown current tier classifies as upgrade to any real tier (documented intent)', () => {
    expect(compareTiers('bogus', 'starter')).toBe('upgrade')
  })

  it('unknown target tier returns "unknown" — an invalid target is not a plan change', () => {
    expect(compareTiers('starter', 'bogus')).toBe('unknown')
  })

  it('two unknown tiers return "unknown" (invalid target takes precedence)', () => {
    expect(compareTiers('bogus', 'also-bogus')).toBe('unknown')
  })
})

describe('getColorClasses', () => {
  const COLORS: Array<PricingTier['color']> = ['blue', 'green', 'purple', 'orange']

  it('returns a full class set for every color used by the catalog', () => {
    for (const color of COLORS) {
      const classes = getColorClasses(color)
      expect(classes).toBeDefined()
      for (const key of ['border', 'bg', 'text', 'iconBg', 'iconText', 'button', 'badge'] as const) {
        expect(classes[key]).toContain(color)
      }
    }
  })

  it('every catalog tier uses a color that resolves to classes', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(getColorClasses(tier.color)).toBeDefined()
    }
  })

  // NOTE: a color outside the union (only reachable via unvalidated data)
  // returns undefined rather than throwing — callers would render with no
  // classes. Locked as current behavior.
  it('returns undefined for a color not in the palette (current behavior)', () => {
    const rogue = 'red' as PricingTier['color']
    expect(getColorClasses(rogue)).toBeUndefined()
  })
})
