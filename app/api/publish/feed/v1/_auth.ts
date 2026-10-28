import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { siteForFeedKey } from '@/lib/publish/feed'

// The feed's door: the key in the Authorization header names the site; a
// generous per-key rate limit keeps one integration from hogging the engine.

export async function feedSite(request: Request) {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return { error: NextResponse.json({ error: 'Send your feed key as: Authorization: Bearer <key>' }, { status: 401 }) }
  const db = createAdminClient()
  const site = await siteForFeedKey(db as never, m[1]).catch(() => null)
  if (!site) return { error: NextResponse.json({ error: 'Unknown feed key' }, { status: 401 }) }
  const limit = await checkSharedRateLimit(`publish-feed:${site.id}`, 'api')
  if (!limit.success) return { error: NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 }) }
  const lang = new URL(request.url).searchParams.get('lang') ?? site.languages[0]
  if (!site.languages.includes(lang)) return { error: NextResponse.json({ error: `This website is in ${site.languages.join(' and ')}` }, { status: 400 }) }
  return { site, lang, db }
}
