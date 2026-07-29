// First-touch marketing attribution, cookie-free.
//
// UTM parameters only exist in the URL of the FIRST page a campaign visitor
// lands on. The contact form used to read them at submit time — so a visitor
// arriving on "/" from an ad and then navigating to /contact submitted with
// no attribution at all. Capture on every marketing-page load into
// sessionStorage (first touch wins; a later organic page view must not
// overwrite the ad that actually brought the visitor), read at submit.
//
// sessionStorage, not localStorage: attribution scoped to the visit, no
// persistent identifier, nothing to consent-gate.

const KEY = 'autoura-first-touch'

export interface FirstTouch {
  utm: Record<string, string>
  landing_page: string
  referrer: string
  captured_at: string
}

export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(KEY)) return // first touch already recorded
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    for (const [k, v] of params.entries()) {
      if (k.startsWith('utm_')) utm[k] = v
    }
    const referrer = document.referrer || ''
    // Record only when there is signal — a blank record would block a later
    // page view that DOES carry UTMs (e.g. SPA entry via a bookmarked "/").
    if (Object.keys(utm).length === 0 && !referrer) return
    const record: FirstTouch = {
      utm,
      landing_page: window.location.pathname + window.location.search,
      referrer,
      captured_at: new Date().toISOString(),
    }
    sessionStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Storage unavailable (private mode etc.) — attribution is best-effort.
  }
}

export function getFirstTouch(): FirstTouch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FirstTouch) : null
  } catch {
    return null
  }
}
