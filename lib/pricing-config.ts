import { Zap, Sparkles, Crown, Building2, LucideIcon } from 'lucide-react'

export interface PricingTier {
  slug: 'starter' | 'professional' | 'business' | 'enterprise'
  name: string
  icon: LucideIcon
  color: 'blue' | 'green' | 'purple' | 'orange'
  monthlyPrice: number
  annualPrice: number
  description: string
  popular?: boolean

  // Limits
  maxUsers: number
  maxItinerariesPerMonth: number
  maxQuotesPerMonth: number
  maxPartners: number

  // Features
  features: {
    b2c: boolean
    b2b: boolean
    whatsapp: boolean
    email: boolean
    pdf: boolean
    analytics: boolean
    customBranding: boolean
    apiAccess: boolean
    prioritySupport: boolean
  }
}

export const PRICING_TIERS: Record<string, PricingTier> = {
  starter: {
    slug: 'starter',
    name: 'Starter',
    icon: Zap,
    color: 'blue',
    monthlyPrice: 49,
    annualPrice: 490,
    description: 'Perfect for small travel agencies just getting started',
    maxUsers: 3,
    maxItinerariesPerMonth: 50,
    maxQuotesPerMonth: 100,
    maxPartners: 10,
    features: {
      b2c: true,
      b2b: false,
      whatsapp: true,
      email: true,
      pdf: true,
      analytics: false,
      customBranding: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  professional: {
    slug: 'professional',
    name: 'Professional',
    icon: Sparkles,
    color: 'green',
    monthlyPrice: 149,
    annualPrice: 1490,
    description: 'For growing agencies managing both B2C and B2B clients',
    popular: true,
    maxUsers: 10,
    maxItinerariesPerMonth: 200,
    maxQuotesPerMonth: 500,
    maxPartners: 50,
    features: {
      b2c: true,
      b2b: true,
      whatsapp: true,
      email: true,
      pdf: true,
      analytics: true,
      customBranding: true,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  business: {
    slug: 'business',
    name: 'Business',
    icon: Crown,
    color: 'purple',
    monthlyPrice: 349,
    annualPrice: 3490,
    description: 'For DMCs and tour operators focused on B2B wholesale',
    maxUsers: 25,
    maxItinerariesPerMonth: 500,
    maxQuotesPerMonth: 1500,
    maxPartners: 150,
    features: {
      b2c: false,
      b2b: true,
      whatsapp: true,
      email: true,
      pdf: true,
      analytics: true,
      customBranding: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
  enterprise: {
    slug: 'enterprise',
    name: 'Enterprise',
    icon: Building2,
    color: 'orange',
    monthlyPrice: 999,
    annualPrice: 9990,
    description: 'Custom solutions for large organizations with unlimited needs',
    maxUsers: 999, // Unlimited
    maxItinerariesPerMonth: 9999,
    maxQuotesPerMonth: 9999,
    maxPartners: 9999,
    features: {
      b2c: true,
      b2b: true,
      whatsapp: true,
      email: true,
      pdf: true,
      analytics: true,
      customBranding: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
}

export const TIER_ORDER: Array<keyof typeof PRICING_TIERS> = ['starter', 'professional', 'business', 'enterprise']

export function getTierLevel(tierSlug: string): number {
  return TIER_ORDER.indexOf(tierSlug as any)
}

export function compareTiers(currentTier: string, targetTier: string): 'upgrade' | 'downgrade' | 'current' {
  const currentLevel = getTierLevel(currentTier)
  const targetLevel = getTierLevel(targetTier)

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
