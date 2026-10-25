import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { createAdminClient } from '@/lib/supabase-server'
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
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const host = request.nextUrl.searchParams.get('host')
  if (!host) return NextResponse.json({ error: 'host is required' }, { status: 400 })
  try {
    const resolved = await resolveSiteByHost(createAdminClient(), host)
    if (!resolved) return NextResponse.json({ error: 'No site for this hostname' }, { status: 404 })
    return NextResponse.json(resolved)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'site lookup failed' }, { status: 500 })
  }
}
