import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net'

// Public marketing pages are crawlable; the operator app is not. Without
// this file /robots.txt redirected to /login — organic discovery was
// impossible.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/about', '/contact', '/integrations', '/docs', '/privacy', '/terms'],
        disallow: ['/api/', '/dashboard', '/settings', '/super-admin', '/share/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
