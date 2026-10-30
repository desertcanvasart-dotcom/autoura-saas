import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideRoute, preferredLanguage, UNKNOWN_HOST_PATH, MISSING_SEGMENT } from '../lib/routing'
import { siteForHost, loadPage, forgetHosts, pageTags, InternalApiError } from '../lib/internal-api'
import { CONTRACT_VERSION, type SiteResolution, type PagePayload } from '@/lib/publish/contract'
import { publishTags } from '@/lib/publish/sync/events'

// ============================================================================
// The Publish renderer's routing (docs/publish/PLAN.md §6, step 3): hostname
// → site → page, the redirects, and the signed calls to the GetAutoura app.
// ============================================================================

const TENANT = '00000000-0000-4000-8000-0000000000aa'
const SITE = '00000000-0000-4000-8000-0000000000bb'

function resolution(over: Partial<SiteResolution> = {}): SiteResolution {
  return {
    site: { id: SITE, tenantId: TENANT, archetype: 'private_journeys', status: 'live', languages: ['en', 'fr'], companyName: 'Sillage', brand: {} },
    domain: { hostname: 'sillage.example', kind: 'primary' },
    primaryHost: 'sillage.example',
    preview: false,
    redirects: [],
    ...over,
  }
}
const route = (pathname: string, r: SiteResolution | null = resolution(), opts: { search?: string; accept?: string } = {}) =>
  decideRoute({ pathname, search: opts.search ?? '', acceptLanguage: opts.accept ?? null, resolution: r })
const base = `/s/${TENANT}/${SITE}`

describe('hostname → site', () => {
  it('a hostname that serves no site gets the plain 404, naming nobody', () => {
    expect(route('/en/tours', null)).toEqual({ type: 'unknown-host' })
    expect(UNKNOWN_HOST_PATH).toBe('/unknown-host')
  })
  it('an alias hostname 301s to the primary, keeping path and query', () => {
    const r = resolution({ domain: { hostname: 'www.sillage.example', kind: 'alias_redirect' } })
    expect(route('/fr/tours/nile', r, { search: '?utm_campaign=x' })).toEqual(
      { type: 'redirect', location: 'https://sillage.example/fr/tours/nile?utm_campaign=x', status: 301 })
  })
  it('an alias with no active primary serves nothing rather than redirecting nowhere', () => {
    expect(route('/en', resolution({ domain: { hostname: 'www.x.example', kind: 'alias_redirect' }, primaryHost: null }))).toEqual({ type: 'unknown-host' })
  })
})

describe('paths', () => {
  it('a language path is that page, served from the internal path', () => {
    expect(route('/fr/tours/nile-classic')).toEqual({ type: 'rewrite', path: `${base}/live/fr/tours/nile-classic` })
    expect(route('/en')).toEqual({ type: 'rewrite', path: `${base}/live/en` })
    expect(route('/en/tours/')).toEqual({ type: 'rewrite', path: `${base}/live/en/tours` })
  })
  it('a test hostname serves the preview mode', () => {
    expect(route('/en/tours', resolution({ preview: true, domain: { hostname: 'staging.sillage.example', kind: 'test' } })))
      .toEqual({ type: 'rewrite', path: `${base}/preview/en/tours` })
  })
  it('a language the site does not have, or no language, is the site\'s own 404', () => {
    expect(route('/es/tours')).toEqual({ type: 'rewrite', path: `${base}/live/en/${MISSING_SEGMENT}` })
    expect(route('/tours')).toEqual({ type: 'rewrite', path: `${base}/live/en/${MISSING_SEGMENT}` })
  })
  it('a visitor cannot reach the internal path, or another company\'s, by typing it', () => {
    expect(route(`/s/other-tenant/other-site/preview/en`)).toEqual({ type: 'rewrite', path: `${base}/live/en/${MISSING_SEGMENT}` })
    expect(route(`/en/../s/x`)).toMatchObject({ type: 'rewrite', path: expect.stringContaining(`${base}/live/en/`) })
  })
})

describe('the front door', () => {
  it('/ goes to the visitor\'s language when the site has it, else English — a 302, never a script', () => {
    expect(route('/', undefined, { accept: 'fr-FR,fr;q=0.9,en;q=0.8' })).toEqual({ type: 'redirect', location: '/fr', status: 302 })
    expect(route('/', undefined, { accept: 'de-DE,de;q=0.9' })).toEqual({ type: 'redirect', location: '/en', status: 302 })
    expect(route('/')).toEqual({ type: 'redirect', location: '/en', status: 302 })
  })
  it('Accept-Language is read by its q-values', () => {
    expect(preferredLanguage('en;q=0.4, fr;q=0.9', ['en', 'fr'])).toBe('fr')
    expect(preferredLanguage('fr;q=0, en', ['en', 'fr'])).toBe('en')
    expect(preferredLanguage('*', ['en', 'es'])).toBe('en')
  })
})

describe('the agency\'s redirects', () => {
  const r = resolution({ redirects: [
    { from: '/old-nile-page', to: '/en/tours/nile-classic', status: 301 },
    { from: '/blog', to: 'https://blog.sillage.example/', status: 302 },
  ] })
  it('apply before anything else, internal ones keeping the query string', () => {
    expect(route('/old-nile-page', r, { search: '?ref=fb' })).toEqual({ type: 'redirect', location: '/en/tours/nile-classic?ref=fb', status: 301 })
    expect(route('/old-nile-page/', r)).toEqual({ type: 'redirect', location: '/en/tours/nile-classic', status: 301 })
    expect(route('/blog', r)).toEqual({ type: 'redirect', location: 'https://blog.sillage.example/', status: 302 })
  })
})

// ---------- the calls to the GetAutoura app ----------

describe('internal API client', () => {
  beforeEach(() => {
    process.env.PUBLISH_APP_URL = 'https://app.test/'
    process.env.PUBLISH_INTERNAL_SECRET = 'internal-secret'
    forgetHosts()
  })

  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('asks with the bearer secret, validates the answer, and caches it for a minute', async () => {
    const f = answer(200, resolution())
    expect(await siteForHost('sillage.example', f, 1000)).toEqual(resolution())
    expect(await siteForHost('sillage.example', f, 30_000)).toEqual(resolution())
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(`https://app.test/api/publish/internal/site?host=sillage.example&v=${CONTRACT_VERSION}`)
    expect((init as RequestInit).headers).toEqual({ authorization: 'Bearer internal-secret' })
    await siteForHost('sillage.example', f, 70_000)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('404 means no site (and is cached); any other failure throws — the proxy answers 503, not 404', async () => {
    expect(await siteForHost('nobody.example', answer(404, {}))).toBeNull()
    await expect(siteForHost('down.example', answer(500, {}))).rejects.toThrow(InternalApiError)
  })
  it('an answer that breaks the contract is refused', async () => {
    await expect(siteForHost('bad.example', answer(200, { site: { id: 'x' } }))).rejects.toThrow()
  })
  it('without its settings the client refuses to guess', async () => {
    delete process.env.PUBLISH_INTERNAL_SECRET
    await expect(siteForHost('x.example', answer(200, {}))).rejects.toThrow(/PUBLISH_INTERNAL_SECRET/)
  })

  const page: PagePayload = {
    kind: 'tour', language: 'fr', path: 'tours/nile', title: 'Nile classic',
    site: { id: SITE, tenantId: TENANT, archetype: 'private_journeys', companyName: 'Sillage', languages: ['en', 'fr'], brand: {},
      identity: { tagline: null, logoUrl: null, phone: null, email: null, whatsapp: null, address: null, licenseNumber: null } },
    alternates: [{ language: 'en', path: 'tours/nile' }],
    tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Nile classic', facts: null, narrative: null }, tours: [], unpublished: false,
  }
  it('a page is fetched under its company\'s sync tags, preview only when asked', async () => {
    const f = answer(200, page)
    expect(await loadPage({ tenantId: TENANT, siteId: SITE, mode: 'live', language: 'fr', path: 'tours/nile' }, f)).toEqual(page)
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(`https://app.test/api/publish/internal/page?site=${SITE}&lang=fr&path=tours%2Fnile&v=${CONTRACT_VERSION}`)
    expect((init as { next: unknown }).next).toEqual({ tags: [publishTags.site(TENANT), publishTags.tours(TENANT)], revalidate: 3600 })
    await loadPage({ tenantId: TENANT, siteId: SITE, mode: 'preview', language: 'fr', path: '' }, f)
    expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0])).toContain('preview=1')
  })
  it('the tags are exactly the ones the sync worker sends for this company', () => {
    expect(pageTags(TENANT)).toEqual([`publish:tenant:${TENANT}`, `publish:tenant:${TENANT}:tours`])
  })
  it('a payload for another site is a bug, not a page', async () => {
    const other = { ...page, site: { ...page.site, tenantId: '00000000-0000-4000-8000-0000000000dd' } }
    await expect(loadPage({ tenantId: TENANT, siteId: SITE, mode: 'live', language: 'fr', path: '' }, answer(200, other)))
      .rejects.toThrow(/different site/)
  })
})
