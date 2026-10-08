import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '@/lib/blog/posts'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net'

// Marketing pages only — the app and traveller share links are not for
// crawlers. Doc pages are enumerated statically; add new ones here.
const DOC_PAGES = [
  'getting-started', 'dashboard', 'clients', 'bookings', 'itineraries',
  'itinerary-creation', 'tour-programs', 'tours-rates', 'b2b-pricing',
  'b2b-quotes', 'b2c-pricing', 'invoices-payments', 'expenses-commissions',
  'profit-loss', 'communication', 'message-templates', 'followups-reminders',
  'resources-documents', 'team-settings', 'workflows',
]

// Rebuilt hourly so a newly published blog post is listed without a deploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const top = ['', '/pricing', '/about', '/demo', '/contact', '/integrations', '/docs', '/blog'].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))
  const legal = ['/privacy', '/terms'].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  }))
  const docs = DOC_PAGES.map((d) => ({
    url: `${SITE_URL}/docs/${d}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
  // Published posts; none (or no database at build time) is just no entries.
  const posts = (await listPublishedPosts({ limit: 500 })).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.updated_at,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))
  return [...top, ...legal, ...docs, ...posts]
}
