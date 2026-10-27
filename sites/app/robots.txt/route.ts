import { normalizeHost } from '@/lib/publish/site-data'
import { siteForHost } from '../../lib/internal-api'
import { robotsTxt } from '../../lib/seo'

// robots.txt for the hostname asked (step 9): open only on a live site's
// primary hostname; a test hostname, an alias or a draft site is closed.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const host = normalizeHost(request.headers.get('host'))
  const resolution = host ? await siteForHost(host).catch(() => null) : null
  const body = host && resolution ? robotsTxt(resolution, host) : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } })
}
