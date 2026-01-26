'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  CreditCard,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Zap,
  Package,
  Users,
  FileText,
  Mail,
  MessageSquare,
  ArrowRight,
  Loader2,
  Crown,
  ChevronRight,
} from 'lucide-react'

interface Subscription {
  plan_name: string
  plan_slug: string
  status: string
  current_period_end: string
  trial_end: string | null
  cancel_at_period_end: boolean
  days_until_renewal: number
}

interface Usage {
  period_start: string
  period_end: string
  metrics: {
    quotes_created: { used: number; limit: number }
    team_members: { used: number; limit: number }
    whatsapp_messages: { used: number; limit: number }
    gmail_emails: { used: number; limit: number }
    pdfs_generated: { used: number; limit: number }
  }
  warnings: string[]
  needs_upgrade: boolean
}

export default function BillingPage() {
  const { tenant, tenantMember, isOwner, isAdmin } = useTenant()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (tenant) {
      fetchBillingData()
    }
  }, [tenant])

  const fetchBillingData = async () => {
    setLoading(true)
    setError(null)

    try {
      const subResponse = await fetch('/api/billing/subscription')
      if (subResponse.ok) {
        const subData = await subResponse.json()
        if (subData.success) {
          setSubscription(subData.subscription)
        }
      }

      const usageResponse = await fetch('/api/billing/usage')
      if (usageResponse.ok) {
        const usageData = await usageResponse.json()
        if (usageData.success) {
          setUsage(usageData.usage)
        }
      }
    } catch (err: any) {
      console.error('Error fetching billing data:', err)
      setError('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }

  const handleManageBilling = async () => {
    if (!isOwner) return

    setActionLoading('portal')
    try {
      const response = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
      })

      const data = await response.json()
      if (data.success && data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to open billing portal')
      }
    } catch (err) {
      setError('Failed to open billing portal')
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Not set'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'Not set'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      trialing: 'bg-blue-50 text-blue-700 border-blue-200',
      past_due: 'bg-red-50 text-red-700 border-red-200',
      canceled: 'bg-gray-50 text-gray-700 border-gray-200',
    }
    const icons: Record<string, React.ReactNode> = {
      active: <CheckCircle2 className="w-3 h-3" />,
      trialing: <Zap className="w-3 h-3" />,
      past_due: <AlertCircle className="w-3 h-3" />,
    }
    const labels: Record<string, string> = {
      active: 'Active',
      trialing: 'Trial',
      past_due: 'Past Due',
      canceled: 'Canceled',
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${styles[status] || styles.canceled}`}>
        {icons[status]}
        {labels[status] || status}
      </span>
    )
  }

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0
    return Math.round((used / limit) * 100)
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-amber-500'
    return 'bg-[#647C47]'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Billing & Subscription</h1>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  if (tenantMember && !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Billing & Subscription</h1>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Access Denied</p>
              <p className="text-xs text-amber-700 mt-0.5">Only owners and admins can access billing.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Billing & Subscription</h1>
              <p className="text-sm text-gray-500">Manage your plan and billing</p>
            </div>
            {isOwner && subscription && (
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={actionLoading === 'portal'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'portal' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                Manage Billing
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Warnings */}
        {usage?.warnings && usage.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Usage Warnings</p>
                <ul className="mt-1 space-y-0.5">
                  {usage.warnings.map((warning, index) => (
                    <li key={index} className="text-xs text-amber-700">• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Current Plan */}
        {subscription && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
                  <Package className="w-4.5 h-4.5 text-[#647C47]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{subscription.plan_name}</span>
                    {getStatusBadge(subscription.status)}
                  </div>
                  <p className="text-xs text-gray-500">Current plan</p>
                </div>
              </div>
              {subscription.plan_slug !== 'enterprise' && (
                <Link
                  href="/settings/billing/plans"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20 transition-colors"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Upgrade
                </Link>
              )}
            </div>

            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Renewal Date
                </p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {formatDate(subscription.current_period_end)}
                </p>
                {subscription.days_until_renewal > 0 && (
                  <p className="text-xs text-gray-400">{subscription.days_until_renewal} days left</p>
                )}
              </div>

              {subscription.trial_end && (
                <div>
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Trial Ends
                  </p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    {formatDate(subscription.trial_end)}
                  </p>
                </div>
              )}

              {subscription.cancel_at_period_end && (
                <div>
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Cancels On
                  </p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    {formatDate(subscription.current_period_end)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage */}
        {usage && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Current Usage</h2>
                <p className="text-xs text-gray-500">
                  {formatDate(usage.period_start)} - {formatDate(usage.period_end)}
                </p>
              </div>
              <Link
                href="/settings/billing/usage"
                className="text-xs font-medium text-[#647C47] hover:text-[#4f613a] flex items-center gap-0.5"
              >
                Details <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Quotes', metric: usage.metrics.quotes_created, icon: FileText, color: 'blue' },
                { label: 'Team', metric: usage.metrics.team_members, icon: Users, color: 'purple' },
                { label: 'WhatsApp', metric: usage.metrics.whatsapp_messages, icon: MessageSquare, color: 'green' },
                { label: 'Emails', metric: usage.metrics.gmail_emails, icon: Mail, color: 'red' },
                { label: 'PDFs', metric: usage.metrics.pdfs_generated, icon: FileText, color: 'orange' },
              ].map((item) => {
                const Icon = item.icon
                const percentage = getUsagePercentage(item.metric.used, item.metric.limit)
                return (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-600">{item.label}</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {item.metric.used}
                      {item.metric.limit !== -1 && (
                        <span className="text-xs font-normal text-gray-400 ml-1">/ {item.metric.limit}</span>
                      )}
                    </p>
                    {item.metric.limit !== -1 && (
                      <div className="mt-1.5 w-full bg-gray-200 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${getUsageColor(percentage)}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/settings/billing/plans"
            className="bg-white border border-gray-200 rounded-xl p-3 hover:border-[#647C47]/50 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">View Plans</p>
                <p className="text-xs text-gray-500">Compare & upgrade</p>
              </div>
            </div>
          </Link>

          <Link
            href="/settings/billing/invoices"
            className="bg-white border border-gray-200 rounded-xl p-3 hover:border-[#647C47]/50 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <FileText className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Invoices</p>
                <p className="text-xs text-gray-500">Download past invoices</p>
              </div>
            </div>
          </Link>

          <Link
            href="/settings/billing/usage"
            className="bg-white border border-gray-200 rounded-xl p-3 hover:border-[#647C47]/50 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Usage Details</p>
                <p className="text-xs text-gray-500">Detailed statistics</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
