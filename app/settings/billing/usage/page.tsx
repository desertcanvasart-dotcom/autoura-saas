'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  AlertCircle,
  FileText,
  Users,
  Mail,
  MessageSquare,
  Loader2,
  Calendar,
  BarChart3,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

interface UsageMetric {
  used: number
  limit: number
  percentage?: number
}

interface Usage {
  period_start: string
  period_end: string
  metrics: {
    quotes_created: UsageMetric
    team_members: UsageMetric
    whatsapp_messages: UsageMetric
    gmail_emails: UsageMetric
    pdfs_generated: UsageMetric
    api_calls: UsageMetric
    storage_gb: UsageMetric
  }
  warnings: string[]
  needs_upgrade: boolean
}

export default function BillingUsagePage() {
  const { tenant, tenantMember, isAdmin } = useTenant()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tenant) {
      fetchUsage()
    }
  }, [tenant])

  const fetchUsage = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/usage')
      const data = await response.json()

      if (data.success) {
        setUsage(data.usage)
      } else {
        setError(data.error || 'Failed to load usage data')
      }
    } catch (err: any) {
      console.error('Error fetching usage:', err)
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0 // Unlimited
    return Math.round((used / limit) * 100)
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200', lightBg: 'bg-red-50' }
    if (percentage >= 80) return { bg: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-200', lightBg: 'bg-yellow-50' }
    return { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200', lightBg: 'bg-green-50' }
  }

  const getUsageStatus = (used: number, limit: number) => {
    if (limit === -1) return { icon: CheckCircle2, text: 'Unlimited', color: 'text-green-600' }
    const percentage = getUsagePercentage(used, limit)
    if (percentage >= 100) return { icon: XCircle, text: 'Limit Reached', color: 'text-red-600' }
    if (percentage >= 90) return { icon: AlertCircle, text: 'Critical', color: 'text-red-600' }
    if (percentage >= 80) return { icon: AlertCircle, text: 'Warning', color: 'text-yellow-600' }
    return { icon: CheckCircle2, text: 'Good', color: 'text-green-600' }
  }

  const formatLimit = (limit: number) => {
    if (limit === -1) return '∞ (Unlimited)'
    return limit.toLocaleString()
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
    )
  }

  // Only show access denied AFTER we've confirmed the user's role is loaded
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

  const usageItems = [
    {
      key: 'quotes_created',
      name: 'Quotes Created',
      icon: FileText,
      color: 'blue',
      metric: usage.metrics.quotes_created,
    },
    {
      key: 'team_members',
      name: 'Team Members',
      icon: Users,
      color: 'purple',
      metric: usage.metrics.team_members,
    },
    {
      key: 'whatsapp_messages',
      name: 'WhatsApp Messages',
      icon: MessageSquare,
      color: 'green',
      metric: usage.metrics.whatsapp_messages,
    },
    {
      key: 'gmail_emails',
      name: 'Gmail Emails Fetched',
      icon: Mail,
      color: 'red',
      metric: usage.metrics.gmail_emails,
    },
    {
      key: 'pdfs_generated',
      name: 'PDFs Generated',
      icon: FileText,
      color: 'orange',
      metric: usage.metrics.pdfs_generated,
    },
    {
      key: 'api_calls',
      name: 'API Calls',
      icon: BarChart3,
      color: 'indigo',
      metric: usage.metrics.api_calls,
    },
  ]

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Billing
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <TrendingUp className="w-7 h-7 text-blue-600" />
                Usage Details
              </h1>
              <p className="text-gray-600 mt-1">
                Monitor your resource usage and limits
              </p>
            </div>
          </div>
        </div>

        {/* Billing Period */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Current Billing Period</p>
              <p className="text-sm text-blue-700 mt-1">
                {new Date(usage.period_start).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                -{' '}
                {new Date(usage.period_end).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {usage.warnings && usage.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900">Usage Warnings</h3>
                <ul className="mt-2 space-y-1">
                  {usage.warnings.map((warning, index) => (
                    <li key={index} className="text-sm text-yellow-700">
                      • {warning}
                    </li>
                  ))}
                </ul>
                {usage.needs_upgrade && (
                  <Link
                    href="/settings/billing/plans"
                    className="inline-block mt-3 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                    Upgrade Plan
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Usage Metrics */}
        <div className="space-y-4">
          {usageItems.map((item) => {
            const Icon = item.icon
            const percentage = getUsagePercentage(item.metric.used, item.metric.limit)
            const colors = getUsageColor(percentage)
            const status = getUsageStatus(item.metric.used, item.metric.limit)
            const StatusIcon = status.icon

            return (
              <div key={item.key} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg bg-${item.color}-100 flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${item.color}-600`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                      <p className="text-sm text-gray-600">
                        {item.metric.used.toLocaleString()} of {formatLimit(item.metric.limit)} used
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-5 h-5 ${status.color}`} />
                    <span className={`text-sm font-medium ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                </div>

                {item.metric.limit !== -1 && (
                  <>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div
                        className={`h-3 rounded-full transition-all ${colors.bg}`}
                        style={{
                          width: `${Math.min(percentage, 100)}%`,
                        }}
                      />
                    </div>

                    {/* Percentage */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {percentage}% used
                      </span>
                      <span className="text-gray-600">
                        {item.metric.limit - item.metric.used > 0
                          ? `${(item.metric.limit - item.metric.used).toLocaleString()} remaining`
                          : 'Limit reached'}
                      </span>
                    </div>

                    {/* Warning Message */}
                    {percentage >= 80 && percentage < 100 && (
                      <div className={`mt-3 p-3 ${colors.lightBg} border ${colors.border} rounded-lg`}>
                        <p className={`text-sm ${colors.text}`}>
                          You're approaching your limit for {item.name.toLowerCase()}. Consider upgrading your plan.
                        </p>
                      </div>
                    )}

                    {percentage >= 100 && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">
                          You've reached your limit for {item.name.toLowerCase()}. Upgrade to continue using this feature.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {item.metric.limit === -1 && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <p className="text-sm text-green-700">
                        Unlimited {item.name.toLowerCase()} on your current plan
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Upgrade CTA */}
        {usage.needs_upgrade && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Need More Resources?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Upgrade your plan to get higher limits and unlock additional features.
                </p>
              </div>
              <Link
                href="/settings/billing/plans"
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all"
              >
                View Plans
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
