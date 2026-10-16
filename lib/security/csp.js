// ============================================
// Content-Security-Policy — what the browser may load, and from where
// ============================================
// CommonJS so next.config.js can require it; the tests import it too.
//
// Two layers, so a missed origin can never break the app in production:
//   ENFORCED    the directives that cannot break a page: no plugins, no
//               <base> hijack, no framing by other sites (as X-Frame-Options).
//   REPORT-ONLY the full allowlist. Violations are POSTed to /api/csp-report
//               and logged; once a week of real traffic (including whatever
//               Google Tag Manager loads) reports nothing unexpected, move
//               the full policy to enforced — see docs/OPERATIONS.md.
//
// 'unsafe-inline' scripts stay allowed: Next.js writes inline bootstrap
// scripts, and nonces would force every page to render dynamically.

const ENFORCED = ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'"]

function originOf(url) {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

/**
 * @param {{ dev?: boolean, growthWidgetUrl?: string | null, supabaseUrl?: string | null }} [opts]
 * @returns {{ enforced: string, reportOnly: string }}
 */
function buildCsp(opts = {}) {
  const growth = originOf(opts.growthWidgetUrl)
  const supabase = originOf(opts.supabaseUrl)
  const supabaseHosts = supabase
    ? [supabase, supabase.replace(/^https:/, 'wss:')]
    : ['https://*.supabase.co', 'wss://*.supabase.co']

  const full = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com`,
    // Leaflet's stylesheet comes from unpkg (components/ItineraryMap.tsx).
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    // Hotel photos, logos and email images come from anywhere on https.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      ...supabaseHosts,
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
      ...(opts.dev ? ['ws:'] : []),
    ].join(' '),
    [
      "frame-src 'self' blob:",
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
      'https://js.stripe.com',
      'https://checkout.stripe.com',
      ...(growth ? [growth] : []),
    ].join(' '),
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    ...ENFORCED,
    'report-uri /api/csp-report',
  ]

  return { enforced: ENFORCED.join('; '), reportOnly: full.join('; ') }
}

module.exports = { buildCsp, ENFORCED }
