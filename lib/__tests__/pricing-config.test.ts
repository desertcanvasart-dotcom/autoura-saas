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

const LIMIT_KEYS = [
  'users',
  'itinerariesPerYear',
  'aiGenerationsPerMonth',
  'b2bPartners',
  'brands',
] as const

/** Tiers with a published, self-serve price. */
const PRICED = ['solo', 'studio'] as const

describe('PRICING_TIERS — catalog integrity', () => {
  it('contains exactly the four known tiers, keyed by their slug', () => {
    expect(Object.keys(PRICING_TIERS).sort()).toEqual(
      ['agency', 'enterprise', 'solo', 'studio']
    )
    for (const [key, tier] of Object.entries(PRICING_TIERS)) {
      expect(tier.slug).toBe(key)
    }
  })

  it('NOTHING BUT THROUGHPUT IS GATED — no capability flags may reappear', () => {
    // Every tenant has the whole product on every tier (business model since
    // 239; the last four display-only capability flags went with migration
    // 343). Tiers are price + limits, nothing else. If someone re-adds a
    // `capabilities` block, this fails.
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(Object.keys(tier), tier.slug).not.toContain('capabilities')
    }
  })

  it('priced tiers have strictly positive prices; contact-sales tiers have null', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      if (tier.publiclyPriced) {
        expect(tier.monthlyPrice, tier.slug).toBeGreaterThan(0)
        expect(tier.annualPrice, tier.slug).toBeGreaterThan(0)
      }
      // A price of 0 must never appear — that is a free tier by accident.
      expect(tier.monthlyPrice, tier.slug).not.toBe(0)
      expect(tier.annualPrice, tier.slug).not.toBe(0)
    }
  })

  it('annual price is exactly 10 × monthly wherever a price exists (2 months free)', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      if (tier.monthlyPrice === null) {
        expect(tier.annualPrice, tier.slug).toBeNull()
        continue
      }
      expect(tier.annualPrice, tier.slug).toBe(tier.monthlyPrice * 10)
    }
  })

  it('only Solo and Studio are publicly priced', () => {
    const priced = Object.values(PRICING_TIERS).filter(t => t.publiclyPriced).map(t => t.slug)
    expect(priced.sort()).toEqual([...PRICED].sort())
  })

  it('Enterprise has no list price at all', () => {
    expect(PRICING_TIERS.enterprise.monthlyPrice).toBeNull()
    expect(PRICING_TIERS.enterprise.annualPrice).toBeNull()
  })

  it('Agency keeps a defined price for sales even though it is unpublished', () => {
    // It flips to publiclyPriced when multi-brand branding and API access ship.
    expect(PRICING_TIERS.agency.publiclyPriced).toBe(false)
    expect(PRICING_TIERS.agency.monthlyPrice).toBe(449)
  })

  it('every tier carries all five limits; null means unlimited, never 0', () => {
    for (const tier of Object.values(PRICING_TIERS)) {
      for (const key of LIMIT_KEYS) {
        const value = tier.limits[key]
        expect(value === null || typeof value === 'number', `${tier.slug}.limits.${key}`).toBe(true)
        if (value !== null) expect(value, `${tier.slug}.limits.${key}`).toBeGreaterThan(0)
      }
      expect(Object.keys(tier.limits).sort()).toEqual([...LIMIT_KEYS].sort())
    }
  })


  it('exactly one tier is flagged popular (studio)', () => {
    const popular = Object.values(PRICING_TIERS).filter((t) => t.popular)
    expect(popular.map((t) => t.slug)).toEqual(['studio'])
  })

  it('locks the agreed price points', () => {
    expect(PRICING_TIERS.solo.monthlyPrice).toBe(69)
    expect(PRICING_TIERS.studio.monthlyPrice).toBe(189)
    expect(PRICING_TIERS.agency.monthlyPrice).toBe(449)
    expect(PRICING_TIERS.enterprise.monthlyPrice).toBeNull()
  })

  it('locks the agreed limits', () => {
    expect(PRICING_TIERS.solo.limits).toEqual({
      users: 3, itinerariesPerYear: 120, aiGenerationsPerMonth: 50, b2bPartners: 3, brands: 1,
    })
    expect(PRICING_TIERS.studio.limits).toEqual({
      users: 12, itinerariesPerYear: 500, aiGenerationsPerMonth: 300, b2bPartners: 15, brands: 1,
    })
    expect(PRICING_TIERS.agency.limits).toEqual({
      users: 30, itinerariesPerYear: 2000, aiGenerationsPerMonth: 1000, b2bPartners: null, brands: 3,
    })
    expect(PRICING_TIERS.enterprise.limits).toEqual({
      users: null, itinerariesPerYear: null, aiGenerationsPerMonth: null, b2bPartners: null, brands: null,
    })
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

      if (prev.monthlyPrice !== null && next.monthlyPrice !== null) {
        expect(next.monthlyPrice, `${next.slug} vs ${prev.slug}`).toBeGreaterThan(prev.monthlyPrice)
      }

      for (const key of LIMIT_KEYS) {
        const a = prev.limits[key]
        const b = next.limits[key]
        // null = unlimited, so it can never be a downgrade.
        if (b === null) continue
        expect(a, `${next.slug}.${key} shrank vs ${prev.slug}`).not.toBeNull()
        expect(b, `${next.slug}.${key}`).toBeGreaterThanOrEqual(a as number)
      }
    }
  })
})

describe('getTierLevel', () => {
  it('maps known tiers to their position in TIER_ORDER', () => {
    expect(getTierLevel('solo')).toBe(0)
    expect(getTierLevel('studio')).toBe(1)
    expect(getTierLevel('agency')).toBe(2)
    expect(getTierLevel('enterprise')).toBe(3)
  })

  it('returns -1 for unknown slugs — never invents a level', () => {
    expect(getTierLevel('platinum')).toBe(-1)
    expect(getTierLevel('')).toBe(-1)
    expect(getTierLevel('SOLO')).toBe(-1) // case-sensitive: slugs are lowercase
  })
})

describe('compareTiers', () => {
  it('classifies moves between known tiers', () => {
    expect(compareTiers('solo', 'agency')).toBe('upgrade')
    expect(compareTiers('enterprise', 'studio')).toBe('downgrade')
    expect(compareTiers('studio', 'studio')).toBe('current')
    // adjacent boundaries
    expect(compareTiers('solo', 'studio')).toBe('upgrade')
    expect(compareTiers('studio', 'solo')).toBe('downgrade')
  })

  // DOCUMENTED intent: a tenant whose stored tier slug is stale/unrecognized
  // has no recognizable plan, so every real plan is presented as an upgrade
  // path (see the comment in compareTiers).
  it('unknown current tier classifies as upgrade to any real tier (documented intent)', () => {
    expect(compareTiers('bogus', 'solo')).toBe('upgrade')
  })

  it('unknown target tier returns "unknown" — an invalid target is not a plan change', () => {
    expect(compareTiers('solo', 'bogus')).toBe('unknown')
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
