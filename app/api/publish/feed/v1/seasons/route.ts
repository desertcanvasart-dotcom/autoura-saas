import { NextResponse } from 'next/server'
import { loadFeedSeasons } from '@/lib/publish/feed'
import { feedSite } from '../_auth'

// The data feed: the agency's peak calendar — which departure dates carry a
// seasonal premium, and how much. ?date=YYYY-MM-DD also answers for that one
// date. lib/publish/feed.ts (feedSeasons), contract.ts (feedSeasonsSchema).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date')
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const found = await feedSite(request)
  if ('error' in found) return found.error
  const asOf = new Date().toISOString().slice(0, 10)
  const seasons = await loadFeedSeasons(found.db as never, found.site.tenantId, asOf, date)
  return NextResponse.json(seasons, { headers: { 'cache-control': 'private, max-age=300' } })
}
