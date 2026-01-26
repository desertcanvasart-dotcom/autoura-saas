'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/app/contexts/TenantContext'
import { Lock } from 'lucide-react'

interface RequireFeatureProps {
  feature: 'b2b' | 'b2c' | 'analytics' | 'whatsapp' | 'email' | 'pdf'
  children: React.ReactNode
  redirectTo?: string
  fallback?: React.ReactNode
}

export default function RequireFeature({
  feature,
  children,
  redirectTo = '/dashboard',
  fallback
}: RequireFeatureProps) {
  const router = useRouter()
  const { hasB2B, hasB2C, hasAnalytics, hasWhatsApp, hasEmail, hasPDF, loading, features } = useTenant()
  const [checkedFeature, setCheckedFeature] = useState<boolean | null>(null)

  const featureMap: Record<string, boolean> = {
    b2b: hasB2B,
    b2c: hasB2C,
    analytics: hasAnalytics,
    whatsapp: hasWhatsApp,
    email: hasEmail,
    pdf: hasPDF
  }

  // Only determine feature access AFTER features have fully loaded
  useEffect(() => {
    if (!loading && features) {
      // Features are loaded, now we can check
      const hasAccess = featureMap[feature]
      setCheckedFeature(hasAccess)

      if (!hasAccess) {
        router.push(redirectTo)
      }
    }
  }, [loading, features, feature, redirectTo, router, hasB2B, hasB2C, hasAnalytics, hasWhatsApp, hasEmail, hasPDF])

  // Still loading or features not yet determined - show loading spinner
  if (checkedFeature === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Feature check completed and user doesn't have access
  if (checkedFeature === false) {
    if (fallback) {
      return <>{fallback}</>
    }

    // This will rarely be seen as we redirect above, but just in case
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

  // Feature is enabled - render children
  return <>{children}</>
}
