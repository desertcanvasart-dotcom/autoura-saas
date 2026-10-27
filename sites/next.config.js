/** @type {import('next').NextConfig} */

// ============================================
// The Publish site renderer — every company's website, one app
// ============================================
// A second Next.js app in this repo (docs/publish/PLAN.md D1), deployed as
// its own Railway service. It shares the repo's node_modules and imports the
// shared Publish code from ../lib, so Turbopack and file tracing are rooted
// at the repo, not at this folder.

// next.config.js is CommonJS; require is how it loads a module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')

const repoRoot = path.join(__dirname, '..')

module.exports = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // No HSTS here: the hostname is the AGENCY's domain, and
        // includeSubDomains/preload would bind their other subdomains too.
        // Their domain decision, made with them (step 11).
      ],
    }]
  },
}
