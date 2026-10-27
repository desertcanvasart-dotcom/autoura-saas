import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION } from '@/lib/publish/contract'
import { createAdminClient } from '@/lib/supabase-server'
import { resolveSiteByEmbedKey } from '@/lib/publish/embed'

// ============================================
// Publish (internal) — which site an embed key shows, and on which websites
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. 404 = an
// unknown key, a suspended site, or no website listed for its blocks.

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
  const key = request.nextUrl.searchParams.get('key') ?? ''
  try {
    const resolved = await resolveSiteByEmbedKey(createAdminClient(), key)
    return resolved ? NextResponse.json(resolved) : NextResponse.json({ error: 'No such embed key' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'embed lookup failed' }, { status: 500 })
  }
}
