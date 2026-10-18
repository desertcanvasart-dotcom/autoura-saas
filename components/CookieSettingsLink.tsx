'use client'

// "Cookie settings": withdrawing analytics consent must be as easy as giving
// it (GDPR). Clears the stored choice and reloads, so any tags already loaded
// are gone and the banner (components/MarketingAnalytics) asks again.
const CONSENT_KEY = 'autoura-analytics-consent'

export default function CookieSettingsLink({ className }: { className?: string }) {
  const reset = () => {
    try {
      localStorage.removeItem(CONSENT_KEY)
    } catch {
      // Storage blocked: nothing was stored to clear.
    }
    window.location.reload()
  }
  return (
    <button type="button" onClick={reset} className={className}>
      Cookie settings
    </button>
  )
}
