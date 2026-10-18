import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '@/lib/blog/posts'
import { SITE_URL } from '@/lib/seo/site'
import { CATEGORIES } from './(public)/docs/toc'

// Marketing pages only — the app and traveller share links are not for
// crawlers. Docs pages come from the docs table of contents (toc.ts), so a
// new page is listed the day it is added; the list here used to be typed by
// hand and had fallen 16 pages behind.

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
  const docs = CATEGORIES.flatMap(c => c.items)
    .filter(item => item.href.startsWith('/docs/'))
    .map(item => ({
      url: `${SITE_URL}${item.href}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))
  // Published posts; none (or no database at build time) is just no entries.
  const posts = (await listPublishedPosts({ limit: 500 })).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.updated_at || p.published_at || undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))
  return [...top, ...legal, ...docs, ...posts]
}
