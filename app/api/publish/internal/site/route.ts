import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'
import { resolveSiteByHost } from '@/lib/publish/site-data'

// ============================================
// Publish (internal) — which site a hostname serves
// ============================================
// Called by the site renderer only (lib/publish/contract.ts), authenticated
// with PUBLISH_INTERNAL_SECRET — the current one or, during a rotation, the
// previous. 404 = this hostname serves no site (unknown, unverified, or the
// site is suspended); the renderer shows a plain, unbranded 404.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied
  const host = request.nextUrl.searchParams.get('host')
  if (!host) return NextResponse.json({ error: 'host is required' }, { status: 400 })
  try {
    const resolved = await resolveSiteByHost(createAdminClient(), host)
    if (!resolved) return NextResponse.json({ error: 'No site for this hostname' }, { status: 404 })
    return NextResponse.json(resolved)
  } catch (e) {
    return publishInternalFailed('site', e, 'site lookup failed')
  }
}
