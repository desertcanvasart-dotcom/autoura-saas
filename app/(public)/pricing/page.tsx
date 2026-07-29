'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Check, Minus, HelpCircle } from 'lucide-react'
import {
  PRICING_TIERS,
  TIER_ORDER,
  TRIAL_DAYS,
  ROADMAP_CAPABILITIES,
  type PricingTier,
  type Limit,
} from '@/lib/pricing-config'

// ============================================
// PUBLIC PRICING
// ============================================
// Every number on this page is READ FROM lib/pricing-config.ts — the same file
// that generates supabase/generated/plans.json, which the enforcement RPC
// reads. Nothing here is hardcoded, so the page cannot drift from what a
// customer is actually charged or actually allowed to do.
//
// Tiers without a published price render "Talk to us" rather than a number.
// That is driven by tier.publiclyPriced, so when Agency's missing capabilities
// ship, flipping one boolean publishes it — no edits here.

const formatMoney = (n: number) => `$${n.toLocaleString()}`

/** null means unlimited, everywhere in the config. */
const formatLimit = (v: Limit) => (v === null ? 'Unlimited' : v.toLocaleString())

interface ComparisonRow {
  label: string
  /** Read straight off the tier — never a literal. */
  value: (t: PricingTier) => string
  note?: string
}

const LIMIT_ROWS: ComparisonRow[] = [
  { label: 'Team members', value: t => formatLimit(t.limits.users) },
  { label: 'Itineraries per year', value: t => formatLimit(t.limits.itinerariesPerYear) },
  { label: 'AI generations per month', value: t => formatLimit(t.limits.aiGenerationsPerMonth) },
  { label: 'B2B partners', value: t => formatLimit(t.limits.b2bPartners) },
  { label: 'Brands', value: t => formatLimit(t.limits.brands) },
]

const CAPABILITY_ROWS: Array<{ label: string; has: (t: PricingTier) => boolean }> = [
  { label: 'Departments, task dispatch & copilot analytics', has: t => t.capabilities.opsTeam },
  { label: 'Concierge brief webhook', has: t => t.capabilities.conciergeWebhook },
  { label: 'Named onboarding contact', has: t => t.capabilities.namedOnboarding },
  { label: 'Multiple companies, one console', has: t => t.capabilities.multiTenantConsole },
]

/** On every tier, at every price. Listed so nobody has to ask. */
const ALWAYS_INCLUDED = [
  'Both B2C and B2B workflows — business model is never a paid feature',
  'The pricing integrity system: missing rates are flagged, incomplete quotes cannot be sent',
  'Invoices, payments, receipts, AR aging and per-trip profit & loss',
  'Client messaging in 29 languages',
  'The full 15-category rate engine, with 1–40 pax rate sheets',
]

/** Stated plainly, because finding out later is worse. */
const NOT_INCLUDED = [
  'No GDS connection — flights are recorded, not booked',
  'No channel manager',
  'No OTA connectivity (Booking.com, Expedia)',
  'Clients cannot pay by card in-app yet — you record payments made elsewhere',
  'Accounting sync (Xero, QuickBooks) is on the roadmap for Q3 2026',
  `On the roadmap, not available today: ${ROADMAP_CAPABILITIES.join(', ')}`,
]

const FAQ = [
  {
    q: 'What happens when I hit a limit?',
    a: `Nothing disappears. Team members and B2B partners stop at the plan limit — you add a seat by upgrading. Itineraries and AI generations are softer: you get a warning at 80%, you keep working past 100%, and only well beyond it does creation pause. Everything you have already created stays fully available and editable at every point.`,
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, in either direction. Moving down while over a limit does not delete anything — your records stay exactly as they are, you simply cannot create more until you are back under the limit or move up again.',
  },
  {
    q: 'What does onboarding involve?',
    a: 'The work is your rate sheets. Hotels, cruises, guides, transport, entrance fees — the numbers you already keep in spreadsheets get loaded so the pricing engine can quote from them. That is what makes a quote calculated rather than estimated, and it is the part worth doing carefully.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: `No. The ${TRIAL_DAYS}-day trial runs without one.`,
  },
  {
    q: 'Why do Agency and Enterprise not show a price?',
    a: 'Because they are shaped around how you work — how many brands, how much volume, what your onboarding needs to cover. A conversation gets you a straight answer faster than a table would.',
  },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/autoura-logo.png" alt="Autoura" width={140} height={36} className="h-9 w-auto" />
            </Link>
            <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-10 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Pricing</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Built by a tour operator with 30+ years in tourism. Plans differ by how much you run
            through them &mdash; never by which half of your business you are allowed to use.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            {TRIAL_DAYS}-day free trial. No card required to start.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-1 mt-8">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                !annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Annual
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-semibold">
                2 months free
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Tier cards */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIER_ORDER.map(key => {
            const tier = PRICING_TIERS[key]
            const monthly = annual && tier.annualPrice !== null
              ? Math.round(tier.annualPrice / 12)
              : tier.monthlyPrice
            const showsPrice = tier.publiclyPriced && monthly !== null

            return (
              <div
                key={key}
                className={`relative bg-white rounded-xl border p-6 flex flex-col ${
                  tier.popular ? 'border-[#647C47] shadow-sm' : 'border-gray-200'
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#647C47] text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}

                <h2 className="text-lg font-semibold text-gray-900">{tier.name}</h2>
                <p className="text-sm text-gray-500 mt-1 min-h-[40px]">{tier.description}</p>

                <div className="mt-5 mb-6">
                  {showsPrice ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">{formatMoney(monthly as number)}</span>
                        <span className="text-sm text-gray-500">/month</span>
                      </div>
                      {annual && tier.annualPrice !== null && (
                        <p className="text-xs text-gray-400 mt-1">
                          {formatMoney(tier.annualPrice)} billed yearly
                        </p>
                      )}
                      {/* Per-plan, not a single global figure: onboarding scales
                          with the size of the rate sheet being set up. */}
                      {tier.onboardingFeeUsd !== null && (
                        <p className="text-xs text-gray-500 mt-2">
                          + {formatMoney(tier.onboardingFeeUsd)} one-time onboarding
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-3xl font-bold text-gray-900">Talk to us</div>
                  )}
                </div>

                <ul className="space-y-2 text-sm text-gray-700 flex-1">
                  <li><strong>{formatLimit(tier.limits.users)}</strong> team members</li>
                  <li><strong>{formatLimit(tier.limits.itinerariesPerYear)}</strong> itineraries/year</li>
                  <li><strong>{formatLimit(tier.limits.aiGenerationsPerMonth)}</strong> AI generations/month</li>
                  <li><strong>{formatLimit(tier.limits.b2bPartners)}</strong> B2B partners</li>
                </ul>

                <Link
                  href="/contact"
                  className={`mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    tier.popular
                      ? 'bg-[#647C47] text-white hover:bg-[#55683c]'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {showsPrice ? 'Apply for the assisted pilot' : 'Contact sales'}
                </Link>
                {showsPrice && (
                  <Link
                    href="/signup"
                    className="mt-2 block text-center text-xs text-gray-500 hover:text-[#647C47] transition-colors"
                  >
                    or start a {TRIAL_DAYS}-day self-serve trial →
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <p className="max-w-6xl mx-auto text-center text-sm text-gray-500 mt-6">
          Onboarding covers rate-sheet setup and is charged once, at the start.
        </p>
      </section>

      {/* Always included */}
      <section className="py-14 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">On every plan</h2>
          <p className="text-gray-600 mb-6">
            These are not upsells. A DMC doing both wholesale and direct should not have to buy a
            tier to do half its own business.
          </p>
          <ul className="space-y-3">
            {ALWAYS_INCLUDED.map(item => (
              <li key={item} className="flex items-start gap-3 text-gray-700">
                <Check className="w-5 h-5 text-[#647C47] flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comparison table — every cell derived from pricing-config */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Compare plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-4 font-semibold text-gray-600">&nbsp;</th>
                  {TIER_ORDER.map(k => (
                    <th key={k} className="text-left py-3 px-4 font-semibold text-gray-900">
                      {PRICING_TIERS[k].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {LIMIT_ROWS.map(row => (
                  <tr key={row.label}>
                    <td className="py-3 pr-4 text-gray-600">{row.label}</td>
                    {TIER_ORDER.map(k => (
                      <td key={k} className="py-3 px-4 text-gray-900">{row.value(PRICING_TIERS[k])}</td>
                    ))}
                  </tr>
                ))}
                {CAPABILITY_ROWS.map(row => (
                  <tr key={row.label}>
                    <td className="py-3 pr-4 text-gray-600">{row.label}</td>
                    {TIER_ORDER.map(k => (
                      <td key={k} className="py-3 px-4">
                        {row.has(PRICING_TIERS[k])
                          ? <Check className="w-4 h-4 text-[#647C47]" />
                          : <Minus className="w-4 h-4 text-gray-300" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Honest limitations */}
      <section className="py-14 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">What Autoura does not do</h2>
          <p className="text-gray-600 mb-6">
            Better to know now than three weeks into an evaluation.
          </p>
          <ul className="space-y-3">
            {NOT_INCLUDED.map(item => (
              <li key={item} className="flex items-start gap-3 text-gray-700">
                <Minus className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Questions</h2>
          <div className="space-y-7">
            {FAQ.map(item => (
              <div key={item.q}>
                <h3 className="flex items-start gap-2 font-semibold text-gray-900 mb-2">
                  <HelpCircle className="w-5 h-5 text-[#647C47] flex-shrink-0 mt-0.5" />
                  {item.q}
                </h3>
                <p className="text-gray-600 pl-7">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#2d3b2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">© 2026 Autoura. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/pricing" className="text-gray-400 hover:text-white text-sm transition-colors">Pricing</Link>
              <Link href="/docs" className="text-gray-400 hover:text-white text-sm transition-colors">Docs</Link>
              <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">Privacy</Link>
              <Link href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">Terms</Link>
              <Link href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
