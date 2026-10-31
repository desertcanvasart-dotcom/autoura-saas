import { normalizeHost } from '@/lib/publish/host'
import { loadSitemap, siteForHost } from '../../../lib/internal-api'
import { languageSitemapXml } from '../../../lib/seo'

// One language's sitemap (/sitemaps/{lang}.xml), with each page's other
// language versions as hreflang links (step 9).

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const language = /^([a-z]{2})\.xml$/.exec(file)?.[1]
  const host = normalizeHost(request.headers.get('host'))
  const resolution = host && language ? await siteForHost(host).catch(() => null) : null
  if (!host || !language || !resolution || !resolution.site.languages.includes(language)) return new Response('Not found', { status: 404 })
  const data = await loadSitemap({ tenantId: resolution.site.tenantId, siteId: resolution.site.id })
  if (!data) return new Response('Not found', { status: 404 })
  return new Response(languageSitemapXml(host, data, language), { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
