import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'
import { resolveSiteByEmbedKey } from '@/lib/publish/embed'

// ============================================
// Publish (internal) — which site an embed key shows, and on which websites
// ============================================
// Called by the site renderer only, with PUBLISH_INTERNAL_SECRET. 404 = an
// unknown key, a suspended site, or no website listed for its blocks.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied
  const key = request.nextUrl.searchParams.get('key') ?? ''
  try {
    const resolved = await resolveSiteByEmbedKey(createAdminClient(), key)
    return resolved ? NextResponse.json(resolved) : NextResponse.json({ error: 'No such embed key' }, { status: 404 })
  } catch (e) {
    return publishInternalFailed('embed', e, 'embed lookup failed')
  }
}
