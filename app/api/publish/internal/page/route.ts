import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { publishInternalDenied, publishInternalFailed } from '@/lib/publish/internal-route'
import { loadPagePayload } from '@/lib/publish/site-data'
import { loadTourFacts } from '@/lib/publish/tour-facts'
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

/** The company switched the fact-only rule off (D12: on by default). */
async function factOnlyRuleOff(db: ReturnType<typeof createAdminClient>, tenantId: string): Promise<boolean> {
  const { data } = await db.from('publish_rules').select('enabled').eq('tenant_id', tenantId).eq('rule_type', 'auto_publish_fact_only').maybeSingle()
  return data ? data.enabled === false : false
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const denied = publishInternalDenied(request)
  if (denied) return denied

  const q = request.nextUrl.searchParams
  const siteId = q.get('site') ?? ''
  const language = q.get('lang') ?? ''
  if (!UUID.test(siteId) || !/^[a-z]{2}$/.test(language)) {
    return NextResponse.json({ error: 'site (uuid) and lang are required' }, { status: 400 })
  }
  try {
    const db = createAdminClient()
    const page = await loadPagePayload(db, {
      siteId, language, path: q.get('path') ?? '', preview: q.get('preview') === '1',
    }, {
      tourFacts: loadTourFacts,
      // §10: approved text withheld because the tour changed under it — the
      // page shows its facts meanwhile, and the company is told once a week.
      // With the fact-only rule switched OFF, a change of facts alone is
      // announced too (with it on — the default — that republishes silently).
      onNarrative: info => {
        if (!info.published) return
        if (info.stale.length) {
          void tellOnce(`publish-narrative-stale:${info.pageId}:${info.language}`, () => notifyTeam({
            tenant_id: info.tenantId,
            dedupe_key: `publish-narrative-stale:${info.pageId}:${info.language}`,
            type: 'publish_narrative_stale',
            title: `Website: new text needed for ${info.tourName}`,
            message: `The tour changed, so its approved text (${info.stale.join(', ')}) is hidden in ${info.language.toUpperCase()} until a new draft is approved. The page shows the tour's facts meanwhile.`,
            link: `/publish/pages/${info.pageId}?lang=${info.language}`,
            roles: ['owner', 'admin', 'manager'],
          }))
        } else if (info.factsChanged) {
          void factOnlyRuleOff(db, info.tenantId).then(off => { if (off) return tellOnce(`publish-facts-changed:${info.pageId}:${info.language}`, () => notifyTeam({
            tenant_id: info.tenantId,
            dedupe_key: `publish-facts-changed:${info.pageId}:${info.language}`,
            type: 'publish_facts_changed',
            title: `Website: ${info.tourName} shows new facts`,
            message: 'A price, inclusion, departure or term changed and the page now shows it. Its approved text did not need to change.',
            link: `/publish/pages/${info.pageId}?lang=${info.language}`,
            roles: ['owner', 'admin', 'manager'],
          })) })
        }
      },
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
    return publishInternalFailed('page', e, 'page lookup failed')
  }
}
