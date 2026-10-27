import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { normalizeHost, domainServes, targetOf, resolveSiteByHost, loadPagePayload, loadSitemap } from '@/lib/publish/site-data'
import { siteResolutionSchema, pagePayloadSchema, sitemapSchema, CONTRACT_VERSION, type TourFacts } from '@/lib/publish/contract'
import { indicativeCurrenciesOf } from '@/lib/publish/site-data'

const FACTS: TourFacts = {
  durationDays: 1, durationNights: 0, images: [], days: [{ day: 1, title: null, city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: [] }],
  mainAttractions: [], highlights: [], inclusions: ['Guide'], exclusions: [], accommodation: [], groupSize: null, departureDays: [], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 99, tier: 'standard', tierLabel: 'Standard' }, byNationality: null, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
}

// ============================================================================
// The GetAutoura side of the renderer's two internal endpoints (Publish step
// 3): which site a hostname serves, what is on a page, and that only the
// renderer may ask.
// ============================================================================

const TENANT = '00000000-0000-4000-8000-0000000000aa'
const SITE = '00000000-0000-4000-8000-0000000000bb'
const TOUR = '00000000-0000-4000-8000-0000000000cc'
const PAGE = '00000000-0000-4000-8000-0000000000dd'
const OFF_TOUR_PAGE = '00000000-0000-4000-8000-0000000000ee'

/** A PostgREST-shaped fake: rows per table (joins pre-embedded), eq/neq filters. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { filters.push(r => r[col] === v); return q },
        neq: (col: string, v: unknown) => { filters.push(r => r[col] !== v); return q },
        in: (col: string, v: unknown[]) => { filters.push(r => v.includes(r[col])); return q },
        rows: () => (tables[table] ?? []).filter(r => filters.every(f => f(r))),
        maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: q.rows(), error: null }),
      }
      return q
    },
  }
}

const site = { id: SITE, tenant_id: TENANT, archetype: 'private_journeys', status: 'live', languages: ['en', 'fr'], brand: { tone: 'warm' }, settings: { indicativeCurrencies: ['USD', 'eur', 'GBP', 'JPY', 'CHF'] },
  tenants: { company_name: 'Sillage', tagline: '  Private journeys since 2003 ', logo_url: 'https://cdn.test/logo.png', company_phone: '', contact_email: 'hello@sillage.test', whatsapp_number: '+201000000000', company_address: null, license_number: 'ETAA 1234' } }
const tourPage = (slug: string, language: string, published: boolean, pageId = PAGE, active = true) => ({
  page_id: pageId, site_id: SITE, language, slug, is_published: published,
  publish_pages: { id: pageId, kind: 'tour', tour_template_id: TOUR, tour_templates: { template_name: active ? 'Nile classic' : 'Retired tour', is_active: active } },
})

function db(over: Partial<{ siteStatus: string; domainKind: string; domainStatus: string }> = {}) {
  return fakeDb({
    publish_domains: [
      { hostname: 'sillage.example', kind: over.domainKind ?? 'primary', status: over.domainStatus ?? 'active', site_id: SITE, publish_sites: { ...site, status: over.siteStatus ?? 'live' } },
    ],
    publish_redirects: [{ site_id: SITE, from_path: '/old', to_path: '/en', status_code: 301 }],
    publish_sites: [{ ...site, status: over.siteStatus ?? 'live' }],
    publish_page_locales: [
      tourPage('nile-classic', 'en', true),
      tourPage('croisiere-nil', 'fr', true),
      tourPage('retired', 'en', true, OFF_TOUR_PAGE, false),
      { ...tourPage('draft-tour', 'en', false, '00000000-0000-4000-8000-0000000000ff'), publish_pages: { id: 'x', kind: 'tour', tour_template_id: TOUR, tour_templates: { template_name: 'Coming soon', is_active: true } } },
      { page_id: 'about', site_id: SITE, language: 'en', slug: 'about-us', is_published: true, publish_pages: { id: 'about', kind: 'about', tour_template_id: null, tour_templates: null } },
    ],
  })
}

describe('rules', () => {
  it('hostnames are compared as stored', () => {
    expect(normalizeHost('Sillage.Example:443')).toBe('sillage.example')
    expect(normalizeHost('sillage.example.')).toBe('sillage.example')
    expect(normalizeHost('localhost')).toBeNull()
    expect(normalizeHost('bad host')).toBeNull()
  })
  it('a test hostname always serves; a real one once verified and live; a suspended site nowhere', () => {
    expect(domainServes('test', 'pending_dns', 'draft')).toBe(true)
    expect(domainServes('primary', 'pending_dns', 'live')).toBe(false)
    expect(domainServes('primary', 'active', 'draft')).toBe(false)
    expect(domainServes('primary', 'active', 'live')).toBe(true)
    expect(domainServes('test', 'active', 'suspended')).toBe(false)
  })
  it('paths', () => {
    expect(targetOf('')).toEqual({ kind: 'home' })
    expect(targetOf('tours')).toEqual({ kind: 'listing' })
    expect(targetOf('tours/nile-classic')).toEqual({ kind: 'tour', slug: 'nile-classic' })
    expect(targetOf('about-us')).toEqual({ kind: 'page', slug: 'about-us' })
    expect(targetOf('tours/a/b')).toEqual({ kind: 'none' })
    expect(targetOf('__missing')).toEqual({ kind: 'none' })
  })
})

describe('resolveSiteByHost', () => {
  it('a verified primary of a live site resolves, in the contract\'s shape, with its redirects', async () => {
    const r = await resolveSiteByHost(db() as never, 'SILLAGE.example:443')
    expect(siteResolutionSchema.parse(r)).toEqual(r)
    expect(r).toMatchObject({ site: { id: SITE, tenantId: TENANT, companyName: 'Sillage' }, preview: false,
      redirects: [{ from: '/old', to: '/en', status: 301 }] })
  })
  it('a test hostname previews a draft site', async () => {
    expect(await resolveSiteByHost(db({ domainKind: 'test', domainStatus: 'pending_dns', siteStatus: 'draft' }) as never, 'sillage.example'))
      .toMatchObject({ preview: true, domain: { kind: 'test' } })
  })
  it('unknown, unverified or suspended: no site', async () => {
    expect(await resolveSiteByHost(db() as never, 'other.example')).toBeNull()
    expect(await resolveSiteByHost(db({ domainStatus: 'verifying' }) as never, 'sillage.example')).toBeNull()
    expect(await resolveSiteByHost(db({ siteStatus: 'suspended' }) as never, 'sillage.example')).toBeNull()
  })
})

describe('approved narrative on the page (step 7)', () => {
  it('only the parts still true to today\'s facts are sent; the rest is reported as stale', async () => {
    const { toStoredPart, withPart, factsHash } = await import('@/lib/publish/narrative')
    const bundle = withPart(withPart(null,
      toStoredPart({ kind: 'overview', segments: [{ type: 'text', text: 'The plateau at dawn.' }] }, FACTS, 'Nile classic')),
      toStoredPart({ kind: 'days', days: [{ day: 1, segments: [{ type: 'text', text: 'Giza first.' }] }] }, { ...FACTS, days: [{ ...FACTS.days[0], sights: ['Sphinx'] }] }, 'Nile classic'))
    const tables: Record<string, Array<Record<string, unknown>>> = {
      publish_versions: [{ id: 'v1', tenant_id: TENANT, content: bundle, facts_snapshot: { hash: factsHash(FACTS) } }],
    }
    const seen: unknown[] = []
    const base = fakeDb({
      publish_sites: [{ ...site }],
      publish_page_locales: [{ ...tourPage('nile-classic', 'en', true), current_version_id: 'v1' }],
      publish_versions: tables.publish_versions,
    })
    const page = await loadPagePayload(base as never, { siteId: SITE, language: 'en', path: 'tours/nile-classic', preview: false },
      { tourFacts: async () => FACTS, onNarrative: info => seen.push(info) })
    expect(page!.tour!.narrative).toEqual({ overview: [{ type: 'text', text: 'The plateau at dawn.' }], highlights: null, days: [], seo: null })
    expect(seen).toEqual([expect.objectContaining({ pageId: PAGE, language: 'en', published: true, stale: ['day 1'], factsChanged: false })])
  })
})

describe('indicative currencies from the site settings', () => {
  it('three-letter codes only, at most three', () => {
    expect(indicativeCurrenciesOf({ indicativeCurrencies: ['USD', 'eur', 'GBP', 'JPY', 'CHF'] })).toEqual(['USD', 'GBP', 'JPY'])
    expect(indicativeCurrenciesOf(null)).toEqual([])
  })
})

describe('loadPagePayload', () => {
  const factsFor = vi.fn(async () => FACTS)
  const load = (path: string, opts: { language?: string; preview?: boolean; siteStatus?: string } = {}) =>
    loadPagePayload(db({ siteStatus: opts.siteStatus }) as never, { siteId: SITE, language: opts.language ?? 'en', path, preview: opts.preview ?? false }, { tourFacts: factsFor })

  it('a published tour page, with its other language for hreflang', async () => {
    const page = await load('tours/nile-classic')
    expect(pagePayloadSchema.parse(page)).toEqual(page)
    expect(page).toMatchObject({ kind: 'tour', title: 'Nile classic', path: 'tours/nile-classic', unpublished: false,
      tour: { templateId: TOUR, name: 'Nile classic', facts: FACTS }, alternates: [{ language: 'fr', path: 'tours/croisiere-nil' }] })
    expect(factsFor).toHaveBeenCalledWith(expect.anything(), { tenantId: TENANT, templateId: TOUR, language: 'en', indicativeCurrencies: ['USD', 'GBP', 'JPY'] })
  })
  it('carries the company identity from its records and the stored brand, blanks as null', async () => {
    const page = await load('')
    expect(page!.site.identity).toEqual({ tagline: 'Private journeys since 2003', logoUrl: 'https://cdn.test/logo.png', phone: null,
      email: 'hello@sillage.test', whatsapp: '+201000000000', address: null, licenseNumber: 'ETAA 1234' })
    expect(page!.site.brand).toEqual({ tone: 'warm' })
  })
  it('the home page exists before any home page row, listing the published, switched-on tours', async () => {
    const home = await load('')
    expect(home).toMatchObject({ kind: 'home', title: 'Sillage', alternates: [{ language: 'fr', path: '' }] })
    expect(home!.tours).toEqual([{ title: 'Nile classic', path: 'tours/nile-classic' }])
  })
  it('an unpublished page shows only in preview, flagged', async () => {
    expect(await load('tours/draft-tour')).toBeNull()
    expect(await load('tours/draft-tour', { preview: true })).toMatchObject({ unpublished: true })
  })
  it('a switched-off tour has no page', async () => {
    expect(await load('tours/retired')).toBeNull()
  })
  it('a core page by its slug; nothing for unknown paths or a language the site lacks', async () => {
    expect(await load('about-us')).toMatchObject({ kind: 'about' })
    expect(await load('no-such-page')).toBeNull()
    expect(await load('__missing')).toBeNull()
    expect(await load('', { language: 'es' })).toBeNull()
  })
  it('a suspended site has no pages', async () => {
    expect(await load('', { siteStatus: 'suspended' })).toBeNull()
  })
})

// ---------- only the renderer may ask ----------

let existingNotice = false
const notifyTeam = vi.fn(async () => {})
vi.mock('@/lib/notifications', () => ({ notifyTeam: (...a: unknown[]) => notifyTeam(...(a as [])) }))
vi.mock('@/lib/publish/tour-facts', () => ({ loadTourFacts: async () => routeFacts }))
let routeFacts: TourFacts = FACTS
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => {
    const d = db() as unknown as { from: (t: string) => unknown }
    return { from: (t: string) => t === 'notifications'
      ? { select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: existingNotice ? [{ id: 'n' }] : [], error: null }) }) }) }) }
      : d.from(t) }
  },
}))
const { GET: siteGET } = await import('@/app/api/publish/internal/site/route')
const { GET: pageGET } = await import('@/app/api/publish/internal/page/route')

describe('the internal endpoints', () => {
  beforeEach(() => {
    process.env.PUBLISH_INTERNAL_SECRET = 'internal-secret'
    process.env.PUBLISH_INTERNAL_SECRET_PREVIOUS = 'old-secret'
  })
  const req = (path: string, auth?: string) =>
    new NextRequest(`https://app.test${path}`, auth ? { headers: { authorization: auth } } : undefined)

  it('refuse anyone without the secret', async () => {
    expect((await siteGET(req('/api/publish/internal/site?host=sillage.example'))).status).toBe(401)
    expect((await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en`, 'Bearer guess'))).status).toBe(401)
  })
  it('answer the renderer, with the current or the previous secret', async () => {
    const r = await siteGET(req('/api/publish/internal/site?host=sillage.example', 'Bearer internal-secret'))
    expect(r.status).toBe(200)
    expect((await r.json()).site.id).toBe(SITE)
    expect((await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en&path=tours/nile-classic`, 'Bearer old-secret'))).status).toBe(200)
  })
  it('a renderer on another contract version is refused plainly', async () => {
    const r = await siteGET(req('/api/publish/internal/site?host=sillage.example&v=1', 'Bearer internal-secret'))
    expect(r.status).toBe(409)
    expect((await siteGET(req(`/api/publish/internal/site?host=sillage.example&v=${CONTRACT_VERSION}`, 'Bearer internal-secret'))).status).toBe(200)
    expect((await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en&v=9`, 'Bearer internal-secret'))).status).toBe(409)
  })
  it('a published tour that can no longer be published tells its company — once a week, not every render', async () => {
    routeFacts = { ...FACTS, price: { ...FACTS.price, status: 'on_request', from: null }, publishable: { ok: false, reasons: ['No tier of the tour has a complete price — every rate it needs must be entered.'] } }
    notifyTeam.mockClear()
    existingNotice = false
    const r = await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en&path=tours/nile-classic`, 'Bearer internal-secret'))
    expect(r.status).toBe(200)
    await new Promise(res => setTimeout(res, 0))
    expect(notifyTeam).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT, dedupe_key: `publish-tour-incomplete:${TOUR}`, roles: ['owner', 'admin', 'manager'] }))
    notifyTeam.mockClear()
    existingNotice = true
    await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en&path=tours/nile-classic`, 'Bearer internal-secret'))
    await new Promise(res => setTimeout(res, 0))
    expect(notifyTeam).not.toHaveBeenCalled()
    routeFacts = FACTS
  })
  it('404 for no site or no page; 400 for a malformed ask', async () => {
    expect((await siteGET(req('/api/publish/internal/site?host=nobody.example', 'Bearer internal-secret'))).status).toBe(404)
    expect((await pageGET(req(`/api/publish/internal/page?site=${SITE}&lang=en&path=nope`, 'Bearer internal-secret'))).status).toBe(404)
    expect((await pageGET(req(`/api/publish/internal/page?site=not-a-uuid&lang=en`, 'Bearer internal-secret'))).status).toBe(400)
  })
})

describe('search engines (step 9)', () => {
  it("a page carries the site's primary hostname, for canonical and hreflang", async () => {
    const page = await loadPagePayload(db() as never, { siteId: SITE, language: 'en', path: '', preview: false }, { tourFacts: async () => FACTS })
    expect(page!.site.publicHost).toBe('sillage.example')
  })
  it('none while the hostname is only a test one', async () => {
    const page = await loadPagePayload(db({ domainKind: 'test' }) as never, { siteId: SITE, language: 'en', path: '', preview: false }, { tourFacts: async () => FACTS })
    expect(page!.site.publicHost).toBeNull()
  })
  it('the sitemap lists published pages per language — never a draft or a switched-off tour', async () => {
    const map = await loadSitemap(db() as never, SITE)
    expect(sitemapSchema.parse(map)).toEqual(map)
    expect(map!.languages).toEqual(['en', 'fr'])
    expect(map!.pages).toEqual([
      { kind: 'home', paths: { en: '', fr: '' }, lastModified: null },
      { kind: 'listing', paths: { en: 'tours', fr: 'tours' }, lastModified: null },
      { kind: 'tour', paths: { en: 'tours/nile-classic', fr: 'tours/croisiere-nil' }, lastModified: null },
      { kind: 'about', paths: { en: 'about-us' }, lastModified: null },
    ])
  })
  it('a suspended site has no sitemap', async () => {
    expect(await loadSitemap(db({ siteStatus: 'suspended' }) as never, SITE)).toBeNull()
  })
})

describe('the tour\'s wording in the page language (approved translation)', () => {
  it('a French page and its listing show the approved names and wording; prices stay the records\'', async () => {
    const { toStoredPart, withPart } = await import('@/lib/publish/narrative')
    const bundle = withPart(null, toStoredPart({ kind: 'labels', items: [
      { source: 'Nile classic', text: 'Le Nil classique' }, { source: 'Giza', text: 'Gizeh' }, { source: 'Guide', text: 'Guide égyptologue' },
    ] }, FACTS, 'Nile classic'))
    const base = fakeDb({
      publish_sites: [{ ...site }],
      publish_page_locales: [{ ...tourPage('le-nil-classique', 'fr', true), current_version_id: 'v-fr' }],
      publish_versions: [{ id: 'v-fr', tenant_id: TENANT, content: bundle, facts_snapshot: null }],
    })
    const page = await loadPagePayload(base as never, { siteId: SITE, language: 'fr', path: 'tours/le-nil-classique', preview: false }, { tourFacts: async () => FACTS })
    expect(page!.title).toBe('Le Nil classique')
    expect(page!.tour!.name).toBe('Le Nil classique')
    expect(page!.tour!.facts!.days[0].city).toBe('Gizeh')
    expect(page!.tour!.facts!.inclusions).toEqual(['Guide égyptologue'])
    expect(page!.tour!.facts!.price).toEqual(FACTS.price)

    const listing = await loadPagePayload(base as never, { siteId: SITE, language: 'fr', path: 'tours', preview: false }, { tourFacts: async () => FACTS })
    expect(listing!.tours).toEqual([{ title: 'Le Nil classique', path: 'tours/le-nil-classique' }])
  })
})
