import { normalizeHost } from '@/lib/publish/site-data'
import { loadSitemap, siteForHost } from '../../lib/internal-api'
import { sitemapIndexXml } from '../../lib/seo'

// The sitemap index (step 9): one sitemap per language of the site.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const resolution = host ? await siteForHost(host).catch(() => null) : null
  if (!host || !resolution) return new Response('Not found', { status: 404 })
  const data = await loadSitemap({ tenantId: resolution.site.tenantId, siteId: resolution.site.id })
  if (!data) return new Response('Not found', { status: 404 })
  return new Response(sitemapIndexXml(host, data), { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
