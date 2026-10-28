import { NextResponse } from 'next/server'
import { loadPagePayload } from '@/lib/publish/site-data'
import { feedTour } from '@/lib/publish/feed'
import { feedSite } from '../../_auth'

// The data feed: one published tour in full — facts from the records, the
// approved text as plain text. lib/publish/feed.ts.
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: 'No such tour' }, { status: 404 })
  const found = await feedSite(request)
  if ('error' in found) return found.error
  const page = await loadPagePayload(found.db as never, { siteId: found.site.id, language: found.lang, path: `tours/${slug}`, preview: false })
  if (!page || page.kind !== 'tour') return NextResponse.json({ error: 'No such published tour' }, { status: 404 })
  return NextResponse.json(feedTour(page), { headers: { 'cache-control': 'private, max-age=60' } })
}
