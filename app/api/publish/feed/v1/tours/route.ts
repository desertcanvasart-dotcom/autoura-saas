import { NextResponse } from 'next/server'
import { loadPagePayload } from '@/lib/publish/site-data'
import { feedSite } from '../_auth'

// The data feed: the website's published tours, each with its card facts
// (length, cities, "from" price, first photo). lib/publish/feed.ts.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const found = await feedSite(request)
  if ('error' in found) return found.error
  const listing = await loadPagePayload(found.db as never, { siteId: found.site.id, language: found.lang, path: 'tours', preview: false })
  return NextResponse.json({
    language: found.lang,
    tours: (listing?.tours ?? []).map(t => ({ slug: t.path.replace(/^tours\//, ''), url_path: `/${found.lang}/${t.path}`, name: t.title, card: t.card ?? null })),
    destinations: listing?.destinations ?? [],
  }, { headers: { 'cache-control': 'private, max-age=60' } })
}
