/** @type {import('next').NextConfig} */

// Security headers applied to every response.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
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

// `npm run analyze` — treemap of what's inside each client chunk. Kept out of
// normal builds; the require is conditional so production doesn't need the dep.
module.exports = process.env.ANALYZE === 'true'
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- next.config.js is CommonJS; conditional so prod installs don't need the dep
    require('@next/bundle-analyzer')({ enabled: true })(nextConfig)
  : nextConfig
