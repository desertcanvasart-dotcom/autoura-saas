import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { createAdminClient } from '@/lib/supabase-server'
import { loadPagePayload } from '@/lib/publish/site-data'

// ============================================
// Publish (internal) — one page of a site
// ============================================
// Called by the site renderer only (lib/publish/contract.ts), authenticated
// with PUBLISH_INTERNAL_SECRET (or _PREVIOUS during a rotation).
// `preview=1` includes pages not yet published — the renderer sends it only
// for a test hostname. 404 = no such page in that language.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams
  const siteId = q.get('site') ?? ''
  const language = q.get('lang') ?? ''
  if (!UUID.test(siteId) || !/^[a-z]{2}$/.test(language)) {
    return NextResponse.json({ error: 'site (uuid) and lang are required' }, { status: 400 })
  }
  try {
    const page = await loadPagePayload(createAdminClient(), {
      siteId, language, path: q.get('path') ?? '', preview: q.get('preview') === '1',
    })
    if (!page) return NextResponse.json({ error: 'No such page' }, { status: 404 })
    return NextResponse.json(page)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'page lookup failed' }, { status: 500 })
  }
}
