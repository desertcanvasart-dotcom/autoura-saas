'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { PRICING_TIERS, TIER_ORDER, compareTiers, getColorClasses } from '@/lib/pricing-config'

interface Subscription {
  plan_name: string
  plan_slug: string
  status: string
}

export default function BillingPlansPage() {
  const { tenant, isOwner } = useTenant()
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [currentTier, setCurrentTier] = useState<'starter' | 'professional' | 'business' | 'enterprise'>('professional')

  useEffect(() => {
    if (tenant) {
      fetchData()
    }
  }, [tenant])

  const fetchData = async () => {
    setLoading(true)
    try {
      const tierResponse = await fetch('/api/settings/pricing-tier')
      if (tierResponse.ok) {
        const tierData = await tierResponse.json()
        if (tierData.success && tierData.tier) {
          setCurrentTier(tierData.tier)
        }
      }

      const subResponse = await fetch('/api/billing/subscription')
      if (subResponse.ok) {
        const subData = await subResponse.json()
        if (subData.success && subData.subscription) {
          setCurrentSubscription(subData.subscription)
          if (subData.subscription.plan_slug) {
            setCurrentTier(subData.subscription.plan_slug as any)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching subscription:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPlan = async (planSlug: string) => {
    if (!isOwner) {
      setError('Only owners can change the subscription')
      return
    }

    setCheckoutLoading(planSlug)
    setError(null)

    try {
      const response = await fetch('/api/settings/pricing-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: planSlug }),
      })

      const data = await response.json()

      if (data.success) {
        setCurrentTier(planSlug as any)
        window.location.reload()
      } else {
        setError(data.error || 'Failed to update plan')
      }
    } catch (err) {
      console.error('Error updating plan:', err)
      setError('Failed to update plan')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const formatPrice = (price: number) => `$${price.toLocaleString()}`
  const formatLimit = (limit: number) => limit >= 9999 ? 'Unlimited' : limit.toLocaleString()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Choose Your Plan</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Billing
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Choose Your Plan</h1>
              <p className="text-sm text-gray-500">Select the perfect plan for your business</p>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-semibold">
                  -17%
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIER_ORDER.map((tierKey) => {
            const tier = PRICING_TIERS[tierKey]
            const TierIcon = tier.icon
            const comparison = compareTiers(currentTier, tierKey)
            const isCurrentPlan = comparison === 'current'
            const isUpgrade = comparison === 'upgrade'

            const monthlyEquivalent = billingCycle === 'yearly'
              ? Math.round(tier.annualPrice / 12)
              : tier.monthlyPrice

            return (
              <div
                key={tierKey}
                className={`relative bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md ${
                  isCurrentPlan
                    ? 'border-[#647C47] ring-1 ring-[#647C47]'
                    : tier.popular
                      ? 'border-[#647C47]/50'
                      : 'border-gray-200'
                }`}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div className="bg-[#647C47] text-white text-center py-1.5 text-xs font-semibold">
                    Most Popular
                  </div>
                )}

                <div className="p-4">
                  {/* Plan Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isCurrentPlan ? 'bg-[#647C47]/10' : 'bg-gray-100'
                      }`}>
                        <TierIcon className={`w-4 h-4 ${isCurrentPlan ? 'text-[#647C47]' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{tier.name}</h3>
                        {isCurrentPlan && (
                          <span className="text-[10px] font-medium text-[#647C47] bg-[#647C47]/10 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{tier.description}</p>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatPrice(monthlyEquivalent)}
                      </span>
                      <span className="text-xs text-gray-500">/mo</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-[10px] text-gray-400">
                        Billed {formatPrice(tier.annualPrice)}/year
                      </p>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Includes</p>
                    <ul className="space-y-1.5">
                      <li className="flex items-center gap-1.5 text-xs text-gray-700">
                        <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                        <span className="font-medium">{formatLimit(tier.maxUsers)}</span> users
                      </li>
                      <li className="flex items-center gap-1.5 text-xs text-gray-700">
                        <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                        <span className="font-medium">{formatLimit(tier.maxItinerariesPerMonth)}</span> itineraries/mo
                      </li>
                      <li className="flex items-center gap-1.5 text-xs text-gray-700">
                        <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                        <span className="font-medium">{formatLimit(tier.maxQuotesPerMonth)}</span> quotes/mo
                      </li>
                      <li className="flex items-center gap-1.5 text-xs text-gray-700">
                        <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                        <span className="font-medium">{formatLimit(tier.maxPartners)}</span> B2B partners
                      </li>
                    </ul>
                  </div>

                  {/* Features */}
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Features</p>
                    <ul className="space-y-1.5">
                      {tier.features.b2c && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          B2C Quotes
                        </li>
                      )}
                      {tier.features.b2b && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          B2B Quotes
                        </li>
                      )}
                      {tier.features.customBranding && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          Custom branding
                        </li>
                      )}
                      {tier.features.analytics && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          Analytics
                        </li>
                      )}
                      {tier.features.apiAccess && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          API access
                        </li>
                      )}
                      {tier.features.prioritySupport && (
                        <li className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-[#647C47] flex-shrink-0" />
                          Priority support
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(tierKey)}
                    disabled={isCurrentPlan || !isOwner || checkoutLoading === tierKey}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                      isCurrentPlan
                        ? 'bg-gray-100 text-gray-500'
                        : isUpgrade
                          ? 'bg-[#647C47] text-white hover:bg-[#4f613a]'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {checkoutLoading === tierKey ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : !isOwner ? (
                      'Owner Only'
                    ) : isUpgrade ? (
                      <>
                        <ArrowUp className="w-3 h-3" />
                        Upgrade
                      </>
                    ) : (
                      <>
                        <ArrowDown className="w-3 h-3" />
                        Downgrade
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Trial Notice */}
        <div className="mt-6 bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-3 flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-[#647C47]" />
          <p className="text-xs font-medium text-gray-700">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>

        {/* Additional Info */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-semibold text-gray-900 mb-1.5">All Plans Include</p>
              <ul className="space-y-0.5 text-gray-600">
                <li>• SSL Security</li>
                <li>• Daily Backups</li>
                <li>• 99.9% Uptime SLA</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1.5">Payment Methods</p>
              <ul className="space-y-0.5 text-gray-600">
                <li>• Credit/Debit Cards</li>
                <li>• Bank Transfer</li>
                <li>• PayPal</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1.5">Support</p>
              <ul className="space-y-0.5 text-gray-600">
                <li>• Email support (all plans)</li>
                <li>• Chat support (Business+)</li>
                <li>• Phone support (Enterprise)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
