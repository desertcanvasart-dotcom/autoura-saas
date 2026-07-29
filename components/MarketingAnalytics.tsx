'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Consent-aware marketing analytics (GA4), public pages only.
//
// Strict consent model: NO analytics script is loaded until the visitor
// explicitly accepts — there is nothing to "deny" server-side because
// nothing runs beforehand. The choice persists in localStorage.
//
// Activation requires NEXT_PUBLIC_GA_MEASUREMENT_ID; without it this
// renders nothing (no banner, no script), so non-marketing deploys and
// local dev stay clean.

const CONSENT_KEY = 'autoura-analytics-consent' // 'granted' | 'denied'
// Measurement IDs are public (they ship in every page's HTML), so the
// production default lives in code; the env var overrides it, and non-prod
// builds stay analytics-free so local clicks never pollute the property.
const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  (process.env.NODE_ENV === 'production' ? 'G-0201EVXNEG' : undefined)

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** Fire a marketing event; safe no-op when analytics is absent/declined. */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, params || {})
  }
}

function loadGa(gaId: string) {
  if (document.getElementById('ga4-script')) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  // Consent Mode: only reached after an explicit grant.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })
  window.gtag('config', gaId, { anonymize_ip: true })
  const s = document.createElement('script')
  s.id = 'ga4-script'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`
  document.head.appendChild(s)
}

export default function MarketingAnalytics() {
  const [consent, setConsent] = useState<'granted' | 'denied' | 'unset' | 'loading'>('loading')
  const pathname = usePathname()

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored === 'granted' || stored === 'denied') {
      setConsent(stored)
      if (stored === 'granted' && GA_ID) loadGa(GA_ID)
    } else {
      setConsent('unset')
    }
  }, [])

  // Marketing pages navigate client-side (next/link), so the initial
  // gtag('config') pageview is the only one GA would ever see. Report
  // subsequent route changes explicitly.
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: pathname })
    }
  }, [pathname])

  if (!GA_ID || consent === 'loading' || consent !== 'unset') return null

  const decide = (choice: 'granted' | 'denied') => {
    localStorage.setItem(CONSENT_KEY, choice)
    setConsent(choice)
    if (choice === 'granted') loadGa(GA_ID)
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <p className="text-sm text-gray-700 mb-3">
        We use analytics cookies to understand how visitors use our site.
        No tracking happens unless you accept.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => decide('denied')}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Decline
        </button>
        <button
          onClick={() => decide('granted')}
          className="px-3 py-1.5 text-sm text-white bg-[#647C47] rounded-lg hover:bg-[#55683c]"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
