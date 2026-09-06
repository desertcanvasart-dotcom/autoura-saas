import { Zap, Sparkles, Crown, Building2, LucideIcon } from 'lucide-react'

// ============================================
// PLAN CATALOGUE — the single source of truth
// ============================================
// This file is canonical. `subscription_plans` (which check_usage_limit reads)
// is DERIVED from it: lib/plans-sync.ts renders supabase/generated/plans.json,
// a vitest file snapshot fails the build on drift, and scripts/sync-plans.mjs
// applies it on every deploy. Editing the database directly no longer sticks.
//
// BUSINESS MODEL IS NOT A FEATURE. B2C and B2B are available on every tier —
// a DMC doing both wholesale and direct is the core customer, so gating either
// had no tier that fit them. `b2c`/`b2b` are gone from this file entirely.
// Whether a workspace SHOWS each is a free per-tenant preference, not an
// entitlement (tenant_features, unchanged by this file).
//
// NEVER GATED, on any tier:
//   - B2C and B2B workflows
//   - the pricing integrity system (missing-rate detection, incomplete-quote
//     marking, the send-path output gate)
//   - core finance: invoices, payments, receipts, AR aging, per-trip P&L
//   - all 29 messaging languages
//   - the full 15-category rate engine
//
// Tiers differ on THROUGHPUT ONLY (the five limits below). Nothing else is
// gated by plan: every capability the product has is on every tier. Things
// that do not exist yet are listed in ROADMAP_CAPABILITIES so the pricing
// page can say so plainly — they are never modelled as tier flags.

/**
 * Free trial length, in days. Single source: the Stripe checkout session and
 * the public pricing page both read this, so the number a prospect is shown
 * cannot drift from the number they actually get.
 */
export const TRIAL_DAYS = 14

/** null means unlimited, everywhere in this file. */
export type Limit = number | null

export interface PricingTier {
  slug: 'solo' | 'studio' | 'agency' | 'enterprise'
  name: string
  icon: LucideIcon
  color: 'blue' | 'green' | 'purple' | 'orange'

  /** USD. null = no list price; contact sales. */
  monthlyPrice: number | null
  annualPrice: number | null

  /**
   * One-time onboarding / rate-sheet setup fee, USD. Set 2026-07-27.
   * null = not advertised and not charged, which is Enterprise: its onboarding
   * is scoped in the sales conversation like its subscription. A figure shown
   * is a figure promised, so null prints nothing rather than a placeholder.
   */
  onboardingFeeUsd: number | null
  /**
   * Whether the PUBLIC pricing page shows a price and offers self-serve
   * checkout. Agency flips to true when multi-brand branding and API access
   * ship — until then it has a defined price for sales, not a published one.
   *
   * This does NOT govern the in-app billing page. A signed-in operator sees a
   * real price and can buy any tier that HAS one (monthlyPrice !== null);
   * gating that on publiclyPriced meant Agency showed "Talk to us" to someone
   * already inside the product, with no way to upgrade themselves.
   */
  publiclyPriced: boolean

  /** Positioning line, shown on the pricing page. */
  description: string
  popular?: boolean

  /** The six metered dimensions. null = unlimited. */
  limits: {
    users: Limit
    itinerariesPerYear: Limit
    aiGenerationsPerMonth: Limit
    b2bPartners: Limit
    brands: Limit
  }

}

/**
 * Sold as roadmap, never as a gate. Each has NO implementation as of
 * 2026-07-26 — verified against the codebase — so modelling them as tier
 * flags would advertise a switch that controls nothing.
 */
export const ROADMAP_CAPABILITIES = [
  'multi-brand document branding',
  'API access',
  'white-label',
  'SSO',
] as const

export const PRICING_TIERS: Record<string, PricingTier> = {
  solo: {
    slug: 'solo',
    name: 'Solo',
    icon: Zap,
    color: 'blue',
    monthlyPrice: 69,
    annualPrice: 690,
    onboardingFeeUsd: 500,
    publiclyPriced: true,
    description: 'For the operator who is still the whole operation.',
    limits: {
      users: 3,
      itinerariesPerYear: 120,
      aiGenerationsPerMonth: 50,
      b2bPartners: 3,
      brands: 1,
    },
  },
  studio: {
    slug: 'studio',
    name: 'Studio',
    icon: Sparkles,
    color: 'green',
    monthlyPrice: 189,
    annualPrice: 1890,
    onboardingFeeUsd: 1000,
    publiclyPriced: true,
    popular: true,
    description: 'For a growing DMC with a real ops team.',
    limits: {
      users: 12,
      itinerariesPerYear: 500,
      aiGenerationsPerMonth: 300,
      b2bPartners: 15,
      brands: 1,
    },
  },
  agency: {
    slug: 'agency',
    name: 'Agency',
    icon: Crown,
    color: 'purple',
    // Defined for sales; not published until multi-brand branding and API
    // access exist, since higher limits alone do not justify the step up.
    monthlyPrice: 449,
    annualPrice: 4490,
    onboardingFeeUsd: 1500,
    publiclyPriced: false,
    description: 'For operators running serious B2B volume or more than one brand.',
    limits: {
      users: 30,
      itinerariesPerYear: 2000,
      aiGenerationsPerMonth: 1000,
      b2bPartners: null,
      brands: 3,
    },
  },
  enterprise: {
    slug: 'enterprise',
    name: 'Enterprise',
    icon: Building2,
    color: 'orange',
    monthlyPrice: null,
    annualPrice: null,
    onboardingFeeUsd: null,
    publiclyPriced: false,
    description: 'For groups running multiple companies on one system.',
    limits: {
      users: null,
      itinerariesPerYear: null,
      aiGenerationsPerMonth: null,
      b2bPartners: null,
      brands: null,
    },
  },
}

export const TIER_ORDER: Array<keyof typeof PRICING_TIERS> = ['solo', 'studio', 'agency', 'enterprise']

export function getTierLevel(tierSlug: string): number {
  return TIER_ORDER.indexOf(tierSlug as any)
}

export function compareTiers(
  currentTier: string,
  targetTier: string
): 'upgrade' | 'downgrade' | 'current' | 'unknown' {
  const currentLevel = getTierLevel(currentTier)
  const targetLevel = getTierLevel(targetTier)

  // An invalid TARGET is not a plan change at all — 'bogus' used to classify
  // as a legitimate downgrade (level -1) and could drive wrong billing UI.
  if (targetLevel === -1) return 'unknown'
  // An invalid/stale CURRENT tier with a valid target is deliberate: the
  // tenant has no recognizable plan, so every real plan is an upgrade path.
  if (currentLevel === targetLevel) return 'current'
  if (targetLevel > currentLevel) return 'upgrade'
  return 'downgrade'
}

export function getColorClasses(color: PricingTier['color']) {
  const colors = {
    blue: {
      border: 'border-blue-200',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      iconBg: 'bg-blue-100',
      iconText: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
      badge: 'bg-blue-100 text-blue-800',
    },
    green: {
      border: 'border-green-200',
      bg: 'bg-green-50',
      text: 'text-green-700',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
      button: 'bg-green-600 hover:bg-green-700',
      badge: 'bg-green-100 text-green-800',
    },
    purple: {
      border: 'border-purple-200',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      iconBg: 'bg-purple-100',
      iconText: 'text-purple-600',
      button: 'bg-purple-600 hover:bg-purple-700',
      badge: 'bg-purple-100 text-purple-800',
    },
    orange: {
      border: 'border-orange-200',
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      iconBg: 'bg-orange-100',
      iconText: 'text-orange-600',
      button: 'bg-orange-600 hover:bg-orange-700',
      badge: 'bg-orange-100 text-orange-800',
    },
  }

  return colors[color]
}
