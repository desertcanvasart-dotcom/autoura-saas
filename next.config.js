/** @type {import('next').NextConfig} */

// next.config.js is CommonJS; require is how it loads a module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCsp } = require('./lib/security/csp.js')

const csp = buildCsp({
  dev: process.env.NODE_ENV !== 'production',
  growthWidgetUrl: process.env.NEXT_PUBLIC_GROWTH_WIDGET_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
})

// Security headers applied to every response.
const securityHeaders = [
  // lib/security/csp.js: the safe directives enforced, the full allowlist
  // report-only until a week of reports shows nothing unexpected.
  { key: 'Content-Security-Policy', value: csp.enforced },
  { key: 'Content-Security-Policy-Report-Only', value: csp.reportOnly },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  // The PDFs read their font from assets/fonts at run time (lib/pdf/quote-fonts.ts
  // for the quotes, lib/pdf/jspdf-font-server.ts for the jsPDF documents, and
  // /api/fonts serves it to the browser); file tracing cannot see a path built
  // at run time, so the routes that use it include the folder explicitly.
  outputFileTracingIncludes: {
    '/api/quotes/**': ['./assets/fonts/**/*'],
    '/api/b2b/**': ['./assets/fonts/**/*'],
    '/api/fonts/**': ['./assets/fonts/**/*'],
    '/api/whatsapp/**': ['./assets/fonts/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rzdspjkldhgcqgbrrcws.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

// `npm run analyze` reads the BUILT output (scripts/analyze-chunks.mjs) rather
// than hooking the bundler. @next/bundle-analyzer lived here and hooked
// config.webpack, which Next 16 never calls because this app builds with
// Turbopack — so it silently produced no report at all. See the script header.
module.exports = nextConfig
