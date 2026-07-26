'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  AlertCircle,
  FileText,
  Users,
  Sparkles,
  Handshake,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react'

/**
 * Usage against plan.
 *
 * The numbers here come from the same four checks the create paths gate on, so
 * this page and the gate can never disagree. It previously read a shape the API
 * did not return (`usage.metrics.quotes_created`), which threw on render.
 */

type Band = 'ok' | 'warning' | 'overage' | 'blocked'

interface Metric {
  key: string
  label: string
  used: number
  /** null = unlimited. */
  limit: number | null
  percentage: number | null
  band: Band
  message: string | null
  window: { start: string; end: string } | null
  undetermined: boolean
}

interface UsageResponse {
  plan: { slug: string; name: string } | null
  metrics: Metric[]
  warnings: string[]
  needs_upgrade: boolean
  upgrade_url: string
}

const ICONS: Record<string, typeof Users> = {
  seats: Users,
  b2b_partners: Handshake,
  ai_generations: Sparkles,
  itineraries: FileText,
}

const BAND_STYLE: Record<Band, { bar: string; text: string; border: string; bg: string }> = {
  ok: { bar: 'bg-green-500', text: 'text-green-700', border: 'border-green-200', bg: 'bg-green-50' },
  warning: { bar: 'bg-yellow-500', text: 'text-yellow-700', border: 'border-yellow-200', bg: 'bg-yellow-50' },
  overage: { bar: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200', bg: 'bg-orange-50' },
  blocked: { bar: 'bg-red-500', text: 'text-red-700', border: 'border-red-200', bg: 'bg-red-50' },
}

function bandStatus(m: Metric): { icon: typeof CheckCircle2; text: string; color: string } {
  if (m.undetermined) return { icon: HelpCircle, text: 'Not determined', color: 'text-gray-500' }
  if (m.limit === null) return { icon: CheckCircle2, text: 'Unlimited', color: 'text-green-600' }
  switch (m.band) {
    case 'blocked':
      return { icon: XCircle, text: 'Limit reached', color: 'text-red-600' }
    case 'overage':
      return { icon: AlertCircle, text: 'Over plan', color: 'text-orange-600' }
    case 'warning':
      return { icon: AlertCircle, text: 'Approaching', color: 'text-yellow-600' }
    default:
      return { icon: CheckCircle2, text: 'Good', color: 'text-green-600' }
  }
}

function formatWindow(w: { start: string; end: string }): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  // `end` is exclusive — show the last day inside the window, not the next
  // window's first day, which reads as an off-by-one to an operator.
  const lastDay = new Date(new Date(w.end).getTime() - 86_400_000)
  return `${new Date(w.start).toLocaleDateString('en-US', opts)} – ${lastDay.toLocaleDateString('en-US', opts)}`
}

export default function BillingUsagePage() {
  const { tenant, tenantMember, isAdmin } = useTenant()
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsage = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/billing/usage')
      const data = await response.json()
      if (data.success) setUsage(data)
      else setError(data.error || 'Failed to load usage data')
    } catch (err) {
      console.error('Error fetching usage:', err)
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tenant) fetchUsage()
  }, [tenant, fetchUsage])

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
    )
  }

  // Only after the role has actually loaded — otherwise every admin sees a
  // flash of "access denied" on the way in.
  if (tenantMember && !isAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Access Denied</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Only owners and admins can access usage information.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !usage) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error || 'Failed to load usage data'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Billing
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-blue-600" />
            Usage Details
          </h1>
          <p className="text-gray-600 mt-1">
            {usage.plan
              ? `What you are using on the ${usage.plan.name} plan.`
              : 'What you are using. No active plan is attached, so nothing is being enforced.'}
          </p>
        </div>

        {usage.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900">Worth a look</h3>
                <ul className="mt-2 space-y-1">
                  {usage.warnings.map((warning, i) => (
                    <li key={i} className="text-sm text-yellow-800">• {warning}</li>
                  ))}
                </ul>
                {usage.needs_upgrade && (
                  <Link
                    href={usage.upgrade_url}
                    className="inline-block mt-3 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                    View plans
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {usage.metrics.map((m) => {
            const Icon = ICONS[m.key] ?? FileText
            const status = bandStatus(m)
            const StatusIcon = status.icon
            const style = BAND_STYLE[m.band]
            const showBar = !m.undetermined && m.limit !== null

            return (
              <div key={m.key} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{m.label}</h3>
                      <p className="text-sm text-gray-600">
                        {m.undetermined
                          ? 'Could not be determined — nothing is being blocked.'
                          : `${m.used.toLocaleString()} of ${m.limit === null ? 'unlimited' : m.limit.toLocaleString()} used`}
                      </p>
                      {m.window && (
                        <p className="text-xs text-gray-500 mt-0.5">{formatWindow(m.window)}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-5 h-5 ${status.color}`} />
                    <span className={`text-sm font-medium ${status.color}`}>{status.text}</span>
                  </div>
                </div>

                {showBar && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div
                        className={`h-3 rounded-full transition-all ${style.bar}`}
                        style={{ width: `${Math.min(m.percentage ?? 0, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>{m.percentage}% used</span>
                      <span>
                        {m.limit !== null && m.limit - m.used > 0
                          ? `${(m.limit - m.used).toLocaleString()} remaining`
                          : 'Over plan'}
                      </span>
                    </div>
                  </>
                )}

                {m.message && (
                  <div className={`mt-3 p-3 ${style.bg} border ${style.border} rounded-lg`}>
                    <p className={`text-sm ${style.text}`}>{m.message}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {usage.needs_upgrade && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Need more room?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Nothing stops working the moment you pass a limit — but a bigger plan will fit better.
                </p>
              </div>
              <Link
                href={usage.upgrade_url}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all whitespace-nowrap"
              >
                View plans
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
