// ============================================
// Publish (internal) routes — the renderer's door
// ============================================
// Every /api/publish/internal/* route is called by the site renderer
// (sites/) only, authenticated with PUBLISH_INTERNAL_SECRET — the current
// one or, during a rotation, the previous. A renderer on another contract
// version would misread the answer, so it is refused plainly (409) rather
// than left to render half a page.

import { NextResponse, type NextRequest } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION } from './contract'

/** The answer to send instead of serving the request (401 / 409), or null
 *  when the renderer may be answered. */
export function publishInternalDenied(request: NextRequest): NextResponse | null {
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asked = request.nextUrl.searchParams.get('v')
  if (asked !== null && asked !== String(CONTRACT_VERSION)) {
    return NextResponse.json({ error: `contract version ${asked} asked, this app speaks ${CONTRACT_VERSION}` }, { status: 409 })
  }
  return null
}

/** A 500 for the renderer: the detail (often database text) goes to the
 *  server log, the answer says only what failed. */
export function publishInternalFailed(tag: string, e: unknown, message: string): NextResponse {
  console.error(`[publish ${tag}]`, e instanceof Error ? e.message : e)
  return NextResponse.json({ error: message }, { status: 500 })
}
