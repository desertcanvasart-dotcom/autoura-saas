import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION } from '@/lib/publish/contract'
import { createAdminClient } from '@/lib/supabase-server'
import { loadSitemap } from '@/lib/publish/site-data'

// ============================================
// Publish (internal) — a site's published pages, for its sitemaps
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. 404 = no
// such site, or it is suspended.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asked = request.nextUrl.searchParams.get('v')
  if (asked !== null && asked !== String(CONTRACT_VERSION)) {
    return NextResponse.json({ error: `contract version ${asked} asked, this app speaks ${CONTRACT_VERSION}` }, { status: 409 })
  }
  const site = request.nextUrl.searchParams.get('site')
  if (!site || !/^[0-9a-f-]{36}$/i.test(site)) return NextResponse.json({ error: 'site is required' }, { status: 400 })
  try {
    const sitemap = await loadSitemap(createAdminClient(), site)
    if (!sitemap) return NextResponse.json({ error: 'No such site' }, { status: 404 })
    return NextResponse.json(sitemap)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'sitemap failed' }, { status: 500 })
  }
}
