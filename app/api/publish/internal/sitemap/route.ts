import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'
import { loadSitemap } from '@/lib/publish/site-data'

// ============================================
// Publish (internal) — a site's published pages, for its sitemaps
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. 404 = no
// such site, or it is suspended.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied
  const site = request.nextUrl.searchParams.get('site')
  if (!site || !/^[0-9a-f-]{36}$/i.test(site)) return NextResponse.json({ error: 'site is required' }, { status: 400 })
  try {
    const sitemap = await loadSitemap(createAdminClient(), site)
    if (!sitemap) return NextResponse.json({ error: 'No such site' }, { status: 404 })
    return NextResponse.json(sitemap)
  } catch (e) {
    return publishInternalFailed('sitemap', e, 'sitemap failed')
  }
}
