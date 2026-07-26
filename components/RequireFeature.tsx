'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTenant } from '@/app/contexts/TenantContext'
import { Lock, EyeOff, X } from 'lucide-react'
import {
  resolveGate,
  workspaceNotice,
  type GatedFeature,
} from '@/lib/workspace-visibility'

/**
 * Guards a page by feature.
 *
 * IMPORTANT — two different things live behind this one prop:
 *
 *   B2C / B2B are workspace PREFERENCES, free on every tier. Turning one off
 *   tidies the sidebar; it must never make records unreachable. This component
 *   used to `router.push('/dashboard')` on a missing flag, which meant hiding
 *   B2C made every client record inaccessible by direct URL across seven
 *   pages — hiding navigation had become hiding data.
 *
 *   analytics / whatsapp / email / pdf are ENTITLEMENTS. Blocking those is
 *   legitimate: the tenant has not paid for them.
 *
 * The decision lives in lib/workspace-visibility.ts so it can be unit-tested;
 * this file only renders it.
 */
interface RequireFeatureProps {
  feature: GatedFeature
  children: React.ReactNode
  /** Only used for entitlements. Preferences never redirect. */
  redirectTo?: string
  /** Only honoured for entitlements — a preference must not swap out content. */
  fallback?: React.ReactNode
}

export default function RequireFeature({
  feature,
  children,
  redirectTo = '/dashboard',
  fallback,
}: RequireFeatureProps) {
  const router = useRouter()
  const { hasB2B, hasB2C, hasAnalytics, hasWhatsApp, hasEmail, hasPDF, loading, features } = useTenant()
  const [noticeDismissed, setNoticeDismissed] = useState(false)

  const featureMap: Record<GatedFeature, boolean> = {
    b2b: hasB2B,
    b2c: hasB2C,
    analytics: hasAnalytics,
    whatsapp: hasWhatsApp,
    email: hasEmail,
    pdf: hasPDF,
  }

  // Until the tenant context has loaded we do not know — and "unknown" must
  // never present as a paywall, so nothing is decided yet.
  const hasAccess = loading || !features ? null : featureMap[feature]
  const outcome = resolveGate(feature, hasAccess)

  if (outcome === 'render') {
    return <>{children}</>
  }

  if (outcome === 'render-with-notice') {
    const notice = workspaceNotice(feature)
    return (
      <>
        {!noticeDismissed && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="max-w-6xl mx-auto flex items-start gap-3">
              <EyeOff className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-amber-900">{notice.title}</p>
                <p className="text-amber-800 mt-0.5">
                  {notice.body}{' '}
                  <Link href={notice.settingsHref} className="underline font-medium">
                    {notice.settingsLabel}
                  </Link>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoticeDismissed(true)}
                className="text-amber-600 hover:text-amber-800 flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* The page renders in full. Hidden means hidden from navigation. */}
        {children}
      </>
    )
  }

  // outcome === 'block' — a genuine entitlement the tenant has not bought.
  if (fallback) {
    return <>{fallback}</>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-orange-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Feature Not Available</h2>
        <p className="text-gray-600 mb-6">
          This feature is not included in your current plan. Upgrade to access {feature.toUpperCase()} functionality.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/settings/billing/plans')}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Plans
          </button>
          <button
            onClick={() => router.push(redirectTo)}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}
