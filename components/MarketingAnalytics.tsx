'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Consent-aware marketing analytics (GA4 + Google Tag Manager), public
// pages only.
//
// Strict consent model: NO analytics script is loaded until the visitor
// explicitly accepts — there is nothing to "deny" server-side because
// nothing runs beforehand. The choice persists in localStorage.
//
// This deliberately does NOT use Google's copy-paste snippets: both load
// Google and set cookies on page load, before any consent. The GTM
// <noscript> iframe is omitted for the same reason — it fires the
// container with JavaScript (and therefore the consent gate) disabled.
//
// DOUBLE-COUNTING: GA4 is configured HERE, directly. Do not also add a
// GA4 Configuration tag inside the GTM container, or every page view is
// counted twice. Use GTM for everything else (ad pixels, etc.).

const CONSENT_KEY = 'autoura-analytics-consent' // 'granted' | 'denied'
// Container/measurement IDs are public (they ship in every page's HTML),
// so production defaults live in code; env vars override them, and
// non-prod builds stay analytics-free so local clicks never pollute the
// property.
const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  (process.env.NODE_ENV === 'production' ? 'G-0201EVXNEG' : undefined)
const GTM_ID =
  process.env.NEXT_PUBLIC_GTM_ID ||
  (process.env.NODE_ENV === 'production' ? 'GTM-5GV2BBQ5' : undefined)

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

function loadGtm(gtmId: string) {
  if (document.getElementById('gtm-script')) return
  window.dataLayer = window.dataLayer || []
  // Tell container tags the visitor has consented, so anything built to
  // respect consent state (Google Consent Mode, custom triggers) can fire.
  window.dataLayer.push({ event: 'consent_granted', analytics_consent: true })
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
  const s = document.createElement('script')
  s.id = 'gtm-script'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`
  document.head.appendChild(s)
}

/** Load every consented tag platform that is configured for this build. */
function loadConsented() {
  if (GA_ID) loadGa(GA_ID)
  if (GTM_ID) loadGtm(GTM_ID)
}

export default function MarketingAnalytics() {
  const [consent, setConsent] = useState<'granted' | 'denied' | 'unset' | 'loading'>('loading')
  const pathname = usePathname()

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored === 'granted' || stored === 'denied') {
      setConsent(stored)
      if (stored === 'granted') loadConsented()
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

  // Banner shows if ANY tag platform is configured for this build.
  if ((!GA_ID && !GTM_ID) || consent === 'loading' || consent !== 'unset') return null

  const decide = (choice: 'granted' | 'denied') => {
    localStorage.setItem(CONSENT_KEY, choice)
    setConsent(choice)
    if (choice === 'granted') loadConsented()
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
