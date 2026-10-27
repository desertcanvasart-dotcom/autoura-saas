import { NextResponse, type NextRequest } from 'next/server'
import { decideRoute, UNKNOWN_HOST_PATH } from './lib/routing'
import { siteForHost } from './lib/internal-api'
import { normalizeHost } from '@/lib/publish/site-data'

// ============================================
// Every request: hostname → company site → page (lib/routing.ts)
// ============================================
// The only place a visitor's URL is interpreted. If the GetAutoura app
// cannot be reached, the answer is 503 (try again) — never a 404 that would
// tell search engines a live site's pages are gone.

export async function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get('host'))
  let resolution
  try {
    resolution = host ? await siteForHost(host) : null
  } catch (e) {
    console.error('[sites] site lookup failed:', e instanceof Error ? e.message : e)
    return new NextResponse('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '30' } })
  }

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    acceptLanguage: request.headers.get('accept-language'),
    resolution,
  })

  if (decision.type === 'redirect') {
    // Relative targets resolve against the hostname the VISITOR used, not
    // the address this server listens on (behind Railway's proxy those differ).
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
    const origin = host ? `${proto}://${request.headers.get('host')}` : request.url
    const res = NextResponse.redirect(new URL(decision.location, origin), decision.status)
    if (request.nextUrl.pathname === '/') res.headers.set('Vary', 'Accept-Language')
    return res
  }
  const target = decision.type === 'rewrite' ? decision.path : UNKNOWN_HOST_PATH
  return NextResponse.rewrite(new URL(target, request.url))
}

export const config = {
  // Everything but Next's own assets and the sync worker's revalidate call.
  matcher: ['/((?!_next/|api/revalidate).*)'],
}
