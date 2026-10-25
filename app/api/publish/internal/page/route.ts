import { NextRequest, NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/support/probe-auth'
import { CONTRACT_VERSION } from '@/lib/publish/contract'
import { createAdminClient } from '@/lib/supabase-server'
import { loadPagePayload } from '@/lib/publish/site-data'
import { notifyTeam } from '@/lib/notifications'

// ============================================
// Publish (internal) — one page of a site
// ============================================
// Called by the site renderer only (lib/publish/contract.ts), authenticated
// with PUBLISH_INTERNAL_SECRET (or _PREVIOUS during a rotation).
// `preview=1` includes pages not yet published — the renderer sends it only
// for a test hostname. 404 = no such page in that language.

export const dynamic = 'force-dynamic'

/**
 * A page is rebuilt after every rate change of its company, and notifyTeam
 * rings on every call — so the notice goes out once a week per tour at most.
 * Best-effort: never delays or fails the page.
 */
async function tellOnce(dedupeKey: string, send: () => Promise<unknown>): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    const { data } = await createAdminClient().from('notifications')
      .select('id').eq('dedupe_key', dedupeKey).gte('created_at', since).limit(1)
    if (data && data.length > 0) return
    await send()
  } catch (e) {
    console.error('[publish] incomplete-tour notice failed:', e instanceof Error ? e.message : e)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization')
  const authorized = bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET)
    || bearerMatches(header, process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // A renderer on another contract version would misread the answer: refuse
  // plainly (409) rather than let it render half a page.
  const asked = request.nextUrl.searchParams.get('v')
  if (asked !== null && asked !== String(CONTRACT_VERSION)) {
    return NextResponse.json({ error: `contract version ${asked} asked, this app speaks ${CONTRACT_VERSION}` }, { status: 409 })
  }

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
    // D7: a published tour that can no longer be published as it stands
    // (its price went incomplete, its inclusions were emptied…) still shows,
    // with "price on request" and no number — and its company is told once.
    const facts = page.tour?.facts
    if (facts && !facts.publishable.ok && !page.unpublished) {
      void tellOnce(`publish-tour-incomplete:${page.tour!.templateId}`, () => notifyTeam({
        tenant_id: page.site.tenantId,
        dedupe_key: `publish-tour-incomplete:${page.tour!.templateId}`,
        type: 'publish_tour_incomplete',
        title: `Website: ${page.tour!.name} needs attention`,
        message: facts.publishable.reasons.join(' '),
        link: null,
        roles: ['owner', 'admin', 'manager'],
      }))
    }
    return NextResponse.json(page)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'page lookup failed' }, { status: 500 })
  }
}
