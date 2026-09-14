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

// `npm run analyze` reads the BUILT output (scripts/analyze-chunks.mjs) rather
// than hooking the bundler. @next/bundle-analyzer lived here and hooked
// config.webpack, which Next 16 never calls because this app builds with
// Turbopack — so it silently produced no report at all. See the script header.
module.exports = nextConfig
