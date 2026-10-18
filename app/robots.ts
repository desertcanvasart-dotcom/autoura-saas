import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/site'

// Public marketing pages are crawlable; the operator app is not. Without
// this file /robots.txt redirected to /login — organic discovery was
// impossible.
//
// Search engines and AI assistants are named and welcomed explicitly: being
// found and quoted by ChatGPT, Claude, Perplexity and Gemini is as much the
// point as Google. They follow the same rules as everyone — the marketing
// site, docs, blog and /llms.txt open; the app, the API and every
// token-bearing link (shared itineraries, staff and portal links, invites)
// closed.

export const AI_AND_SEARCH_CRAWLERS = [
  'Googlebot', 'Bingbot', 'Applebot', 'DuckDuckBot',
  // OpenAI: search index, user-triggered fetches, training.
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  // Anthropic: search, user-triggered fetches, training.
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'CCBot',
]

export const PUBLIC_PATHS = [
  '/', '/pricing', '/about', '/demo', '/contact', '/integrations', '/docs', '/blog', '/privacy', '/terms',
  '/llms.txt', '/llms-full.txt',
]

export const PRIVATE_PATHS = [
  '/api/', '/share/', '/staff/', '/portal/', '/invite/',
  '/dashboard', '/settings', '/super-admin', '/onboarding',
]

export default function robots(): MetadataRoute.Robots {
  const rule = { allow: PUBLIC_PATHS, disallow: PRIVATE_PATHS }
  return {
    rules: [
      { userAgent: AI_AND_SEARCH_CRAWLERS, ...rule },
      { userAgent: '*', ...rule },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
