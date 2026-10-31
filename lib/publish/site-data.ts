// ============================================
// Publish — which site a hostname serves, and what is on a page
// ============================================
// Read by the internal endpoints the site renderer calls (contract.ts). Runs
// with the service role, so every query names the site or company it is
// for; the site comes from the hostname, never from anything the visitor
// sent in a body or query of their own.
//
// Step 3: identity and page structure. Facts join the page in step 5.

import type { SitemapData, SiteResolution, PagePayload, PageNarrative, TourFacts } from './contract'
import { loadTourFacts } from './tour-facts'
import { placeReviews, reviewsSettingsOf, type PlaceReviews } from './reviews'
import { factsHash, renderableNarrative, translateFacts, type NarrativeBundle } from './narrative'
import { normalizeHost, domainServes } from './host'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

// ---------- pure rules ----------

// normalizeHost / domainServes live in host.ts (pure, for the renderer);
// re-exported here for the callers that already import them from this file.
export { normalizeHost, domainServes }

export type PathTarget =
  | { kind: 'home' }
  | { kind: 'listing' }
  | { kind: 'tour'; slug: string }
  | { kind: 'page'; slug: string }
  | { kind: 'destination'; slug: string }
  | { kind: 'none' }

/** What a path inside a language asks for. */
export function targetOf(path: string): PathTarget {
  const parts = path.split('/').filter(Boolean)
  const slugOk = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)
  if (parts.length === 0) return { kind: 'home' }
  if (parts[0] === 'tours') {
    if (parts.length === 1) return { kind: 'listing' }
    if (parts.length === 2 && slugOk(parts[1])) return { kind: 'tour', slug: parts[1] }
    return { kind: 'none' }
  }
  if (parts[0] === 'destinations') {
    if (parts.length === 2 && slugOk(parts[1])) return { kind: 'destination', slug: parts[1] }
    return { kind: 'none' }
  }
  if (parts.length === 1 && slugOk(parts[0])) return { kind: 'page', slug: parts[0] }
  return { kind: 'none' }
}

/** A place's address segment, from its name in the records ("Kom Ombo" → "kom-ombo"). */
export function placeSlug(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place'
}

type Card = NonNullable<PagePayload['tours'][number]['card']>

/** A tour card's facts, from the same facts as the tour's page. */
export function cardOf(facts: TourFacts, labels: Record<string, string> = {}): Card {
  const shown = translateFacts(facts, labels)
  const cities = [...new Set(shown.days.map(d => d.city).filter((c): c is string => !!c))]
  const unique = (list: string[]) => [...new Set(list.map(x => x.trim()).filter(Boolean))]
  return {
    days: facts.durationDays,
    nights: facts.durationNights,
    cities,
    from: facts.price.status === 'available' && facts.price.fromPrice !== null ? { amount: facts.price.fromPrice, currency: facts.price.currency } : null,
    image: facts.images[0] ?? null,
    type: shown.tourType ?? null,
    hours: facts.durationHours ?? null,
    highlights: unique(shown.highlights.length ? shown.highlights : shown.mainAttractions).slice(0, 3),
    // The records' own names (not the translation): the default pictures are
    // matched on them. The first day's sights lead — "the first itinerary site".
    places: unique([...facts.days.flatMap(d => d.sights), ...facts.mainAttractions, ...facts.days.map(d => d.city ?? '')]).slice(0, 12),
    guideLanguages: facts.guideLanguages ?? [],
  }
}

/** Run at most `limit` at once — one company's tours, each through the pricing engine. */
async function inBatches<T, R>(items: T[], limit: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await f(items[i]) }
  }))
  return out
}

const tourPath = (slug: string) => `tours/${slug}`

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The company's identity fields, as the contract carries them. */
export function identityOf(t: Record<string, unknown> | null | undefined): PagePayload['site']['identity'] {
  return {
    tagline: blankToNull(t?.tagline),
    logoUrl: blankToNull(t?.logo_url),
    phone: blankToNull(t?.company_phone),
    email: blankToNull(t?.contact_email),
    whatsapp: blankToNull(t?.whatsapp_number),
    address: blankToNull(t?.company_address),
    licenseNumber: blankToNull(t?.license_number),
  }
}

/** The footer's legal details the agency set for its website
 *  (publish_sites.settings.legal): the registered company, and https links
 *  to its booking terms and privacy notice. Anything else reads as unset. */
export function legalOf(settings: unknown): { legalEntity: string | null; termsUrl: string | null; privacyUrl: string | null } {
  const l = (settings as { legal?: Record<string, unknown> } | null)?.legal ?? {}
  const https = (v: unknown) => {
    if (typeof v !== 'string') return null
    try { return new URL(v).protocol === 'https:' ? v : null } catch { return null }
  }
  return { legalEntity: blankToNull(l.entity), termsUrl: https(l.termsUrl), privacyUrl: https(l.privacyUrl) }
}

/** The agency's About text in a language (publish_sites.settings.about),
 *  written and saved by a manager; null when there is none. */
export function aboutOf(settings: unknown, language: string): string | null {
  const a = (settings as { about?: Record<string, unknown> } | null)?.about
  const v = a && typeof a === 'object' ? a[language] : null
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** The home page's own headline in a language and the year the company
 *  started (publish_sites.settings.headline / .foundedYear), as a manager
 *  saved them; null where unset. */
export function homeOf(settings: unknown, language: string): { headline: string | null; foundedYear: number | null } {
  const st = (settings ?? {}) as { headline?: Record<string, unknown>; foundedYear?: unknown }
  const h = st.headline && typeof st.headline === 'object' ? st.headline[language] : null
  const y = st.foundedYear
  return {
    headline: typeof h === 'string' && h.trim() ? h.trim() : null,
    foundedYear: typeof y === 'number' && Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null,
  }
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** When the company answers (publish_sites.settings.hours); null when unset
 *  or not a sensible span. */
export function hoursOf(settings: unknown): NonNullable<PagePayload['site']['identity']['hours']> | null {
  const h = (settings as { hours?: { opens?: unknown; closes?: unknown; days?: unknown } } | null)?.hours
  if (!h || typeof h.opens !== 'string' || typeof h.closes !== 'string' || !HHMM.test(h.opens) || !HHMM.test(h.closes) || h.opens >= h.closes) return null
  const days = Array.isArray(h.days) ? WEEKDAYS.filter(d => (h.days as unknown[]).includes(d)) : []
  return days.length ? { opens: h.opens, closes: h.closes, days } : null
}

/** The About page's own parts (publish_sites.settings): the headline in this
 *  language, the team photo, and the people — each only as saved. */
export function aboutPageOf(settings: unknown, language: string): NonNullable<PagePayload['aboutPage']> {
  const st = (settings ?? {}) as { aboutHeadline?: Record<string, unknown>; teamPhoto?: unknown; people?: unknown }
  const h = st.aboutHeadline && typeof st.aboutHeadline === 'object' ? st.aboutHeadline[language] : null
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const people = Array.isArray(st.people) ? st.people.flatMap(p => {
    const x = (p ?? {}) as Record<string, unknown>
    const name = text(x.name)
    if (!name) return []
    return [{
      name,
      role: text(x.role) ?? '',
      kind: x.kind === 'staff' ? 'staff' as const : 'guide' as const,
      languages: Array.isArray(x.languages) ? x.languages.filter((l): l is string => typeof l === 'string' && /^[a-z]{2}$/.test(l)) : [],
      photo: text(x.photo),
    }]
  }) : []
  return { headline: text(h), teamPhoto: text(st.teamPhoto), people }
}

// ---------- the site behind a hostname ----------

export async function resolveSiteByHost(db: Db, rawHost: string): Promise<SiteResolution | null> {
  const host = normalizeHost(rawHost)
  if (!host) return null

  const { data: domain, error } = await db.from('publish_domains')
    .select('hostname, kind, status, site_id, publish_sites(id, tenant_id, archetype, status, languages, brand, tenants(company_name))')
    .eq('hostname', host)
    .maybeSingle()
  if (error) throw new Error(`reading the domain: ${error.message}`)
  const site = domain?.publish_sites
  if (!domain || !site || !domainServes(domain.kind, domain.status, site.status)) return null

  const [{ data: primary, error: pErr }, { data: redirects, error: rErr }] = await Promise.all([
    db.from('publish_domains').select('hostname')
      .eq('site_id', site.id).eq('kind', 'primary').eq('status', 'active').maybeSingle(),
    db.from('publish_redirects').select('from_path, to_path, status_code').eq('site_id', site.id),
  ])
  if (pErr) throw new Error(`reading the primary domain: ${pErr.message}`)
  if (rErr) throw new Error(`reading redirects: ${rErr.message}`)

  return {
    site: {
      id: site.id,
      tenantId: site.tenant_id,
      archetype: site.archetype,
      status: site.status,
      languages: site.languages,
      companyName: site.tenants?.company_name ?? '',
      brand: site.brand ?? {},
    },
    domain: { hostname: domain.hostname, kind: domain.kind },
    primaryHost: primary?.hostname ?? null,
    preview: domain.kind === 'test',
    redirects: (redirects ?? []).map((r: { from_path: string; to_path: string; status_code: 301 | 302 }) => ({
      from: r.from_path, to: r.to_path, status: r.status_code,
    })),
  }
}

// ---------- one page ----------

interface LocaleRow {
  page_id: string
  language: string
  slug: string
  is_published: boolean
  current_version_id?: string | null
  publish_pages: {
    id: string
    kind: PagePayload['kind']
    tour_template_id: string | null
    tour_templates: { template_name: string; is_active: boolean | null } | null
  } | null
}

const LOCALE_SELECT = 'page_id, language, slug, is_published, current_version_id, publish_pages(id, kind, tour_template_id, tour_templates(template_name, is_active))'

/** A locale that may be shown: published (or previewing), and for a tour
 *  page, a tour that still exists and is switched on. */
function showable(row: LocaleRow, preview: boolean): boolean {
  if (!row.publish_pages) return false
  if (!row.is_published && !preview) return false
  if (row.publish_pages.kind === 'tour') {
    const tour = row.publish_pages.tour_templates
    if (!tour || tour.is_active === false) return false
  }
  return true
}

function pathOf(row: LocaleRow): string {
  const kind = row.publish_pages?.kind
  if (kind === 'tour') return tourPath(row.slug)
  if (kind === 'home') return ''
  return row.slug
}

export interface NarrativeInfo {
  tenantId: string
  pageId: string
  templateId: string
  tourName: string
  language: string
  published: boolean
  /** Parts withheld because the records changed under them. */
  stale: string[]
  /** The facts differ from those shown when the narrative was last approved. */
  factsChanged: boolean
}

export interface PageDeps {
  tourFacts: (db: Db, input: { tenantId: string; templateId: string; language: string; indicativeCurrencies: string[] }) => Promise<TourFacts>
  /** Told what the page's narrative looks like against today's facts. */
  onNarrative?: (info: NarrativeInfo) => void
  /** The agency's Google reviews; defaults to lib/publish/reviews placeReviews. */
  reviews?: (placeId: string, language: string) => Promise<PlaceReviews | null>
}

/** The currencies a site shows indicative prices in (publish_sites.settings). */
export function indicativeCurrenciesOf(settings: unknown): string[] {
  const list = (settings as { indicativeCurrencies?: unknown } | null)?.indicativeCurrencies
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && /^[A-Z]{3}$/.test(c)).slice(0, 3) : []
}

export async function loadPagePayload(db: Db, input: {
  siteId: string
  language: string
  path: string
  preview: boolean
}, deps: PageDeps = { tourFacts: loadTourFacts }): Promise<PagePayload | null> {
  const { data: site, error: sErr } = await db.from('publish_sites')
    .select('id, tenant_id, archetype, status, languages, brand, settings, tenants(company_name, tagline, logo_url, company_phone, contact_email, whatsapp_number, company_address, license_number)')
    .eq('id', input.siteId).maybeSingle()
  if (sErr) throw new Error(`reading the site: ${sErr.message}`)
  if (!site || site.status === 'suspended' || !site.languages.includes(input.language)) return null

  const target = targetOf(input.path)
  if (target.kind === 'none') return null

  const { data: primary, error: hErr } = await db.from('publish_domains').select('hostname')
    .eq('site_id', input.siteId).eq('kind', 'primary').eq('status', 'active').maybeSingle()
  if (hErr) throw new Error(`reading the primary domain: ${hErr.message}`)

  const siteInfo = {
    id: site.id as string,
    tenantId: site.tenant_id as string,
    archetype: site.archetype,
    companyName: (site.tenants?.company_name as string | undefined) ?? '',
    languages: site.languages as string[],
    brand: (site.brand ?? {}) as Record<string, unknown>,
    identity: { ...identityOf(site.tenants), ...legalOf(site.settings), ...homeOf(site.settings, input.language), hours: hoursOf(site.settings) },
    publicHost: (primary?.hostname as string | undefined) ?? null,
  }

  // Every locale of the site in this language: few enough per company to
  // read at once, and the home page, listing and lookups all need them.
  const { data: rows, error: lErr } = await db.from('publish_page_locales')
    .select(LOCALE_SELECT).eq('site_id', input.siteId).eq('language', input.language)
  if (lErr) throw new Error(`reading pages: ${lErr.message}`)
  const locales = ((rows ?? []) as LocaleRow[]).filter(r => showable(r, input.preview))
  const tourLocales = locales.filter(r => r.publish_pages!.kind === 'tour')
  const names = await approvedNames(db, siteInfo.tenantId, tourLocales)
  // Cards (and the places they add up to) only where tours are listed: a
  // tour page needs neither, and each card runs the pricing engine.
  // The Contact page reads them too: its interest chips are the places the tours go.
  const listed = target.kind === 'home' || target.kind === 'listing' || target.kind === 'destination'
    || (target.kind === 'page' && target.slug === 'contact')
  const facts = listed
    ? await inBatches(tourLocales, 6, r => deps.tourFacts(db, {
      tenantId: siteInfo.tenantId, templateId: r.publish_pages!.tour_template_id!, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    }).catch(() => null))
    : []
  const places = new Map<string, { name: string; tours: Set<string> }>()
  const tourLinks = tourLocales
    .map((r, i) => {
      const name = r.publish_pages!.tour_templates!.template_name
      const labels = names.get(r.current_version_id ?? '') ?? {}
      const f = facts[i]
      if (f) for (const d of f.days) {
        if (!d.city) continue
        const slug = placeSlug(d.city)
        const place = places.get(slug) ?? { name: labels[d.city] ?? d.city, tours: new Set<string>() }
        place.tours.add(r.slug)
        places.set(slug, place)
      }
      return { title: labels[name] ?? name, path: tourPath(r.slug), ...(f ? { card: cardOf(f, labels) } : {}) }
    })
    .sort((a, b) => a.title.localeCompare(b.title, input.language))
  const destinations = [...places].map(([slug, p]) => ({ name: p.name, path: `destinations/${slug}`, count: p.tours.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, input.language))

  let row: LocaleRow | undefined
  if (target.kind === 'home') row = locales.find(r => r.publish_pages!.kind === 'home')
  else if (target.kind === 'tour') row = locales.find(r => r.publish_pages!.kind === 'tour' && r.slug === target.slug)
  else if (target.kind === 'page') row = locales.find(r => !['tour', 'home', 'listing'].includes(r.publish_pages!.kind) && r.slug === target.slug)
  else if (target.kind === 'listing') row = locales.find(r => r.publish_pages!.kind === 'listing')

  // A destination page exists while a listed tour goes there — built from
  // the records, never a page row of its own.
  if (target.kind === 'destination') {
    const place = places.get(target.slug)
    if (!place) return null
    return {
      kind: 'destination', language: input.language, path: `destinations/${target.slug}`, title: place.name,
      site: siteInfo,
      alternates: siteInfo.languages.filter(l => l !== input.language).map(l => ({ language: l, path: `destinations/${target.slug}` })),
      tour: null,
      tours: tourLinks.filter(l => place.tours.has(l.path.slice('tours/'.length))),
      destinations,
      destination: { name: place.name, slug: target.slug },
      unpublished: false,
      pageId: null,
    }
  }

  // The home page, the tour listing, and the About and Contact pages exist
  // even before a page row is made for them: every site has a front door and
  // a way to reach the company. A row of that kind, where there is one, wins.
  const standing = target.kind === 'page' && (target.slug === 'about' || target.slug === 'contact')
    && !locales.some(r => r.publish_pages!.kind === target.slug) ? target.slug as 'about' | 'contact' : null
  if (!row && target.kind !== 'home' && target.kind !== 'listing' && !standing) return null

  const kind: PagePayload['kind'] = row?.publish_pages?.kind ?? standing ?? (target.kind === 'home' ? 'home' : 'listing')
  const templateId = kind === 'tour' ? row?.publish_pages?.tour_template_id ?? null : null
  let tour: PagePayload['tour'] = null
  if (templateId) {
    const name = row!.publish_pages!.tour_templates!.template_name
    const facts = await deps.tourFacts(db, {
      tenantId: siteInfo.tenantId, templateId, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    })
    let narrative: PageNarrative | null = null
    let labels: Record<string, string> = {}
    if (row!.current_version_id) {
      const { data: version, error: vErr } = await db.from('publish_versions').select('content, facts_snapshot')
        .eq('id', row!.current_version_id).eq('tenant_id', siteInfo.tenantId).maybeSingle()
      if (vErr) throw new Error(`reading the published text: ${vErr.message}`)
      const r = renderableNarrative((version?.content as NarrativeBundle) ?? null, facts, name)
      // renderableNarrative keeps only slots the tour can fill — all of them known keys.
      narrative = { overview: r.overview, highlights: r.highlights, days: r.days, seo: r.seo } as PageNarrative
      labels = r.labels
      deps.onNarrative?.({
        tenantId: siteInfo.tenantId, pageId: row!.page_id, templateId, tourName: name, language: input.language,
        published: row!.is_published, stale: r.stale,
        factsChanged: Boolean(version?.facts_snapshot?.hash && version.facts_snapshot.hash !== factsHash(facts)),
      })
    }
    // The tour's own wording in this language, where a person approved it
    // (the 'labels' part); numbers, prices and terms stay the records'.
    tour = { templateId, name: labels[name] ?? name, facts: translateFacts(facts, labels), narrative }
  }

  // A tour page's related tours: the site's others, those sharing a place
  // with this one first. A few are read, not all — each runs the engine.
  let related: PagePayload['tours'] = []
  if (tour?.facts) {
    const mine = new Set(tour.facts.days.map(d => d.city).filter(Boolean))
    const others = tourLocales.filter(r => r.page_id !== row!.page_id).slice(0, 6)
    const otherFacts = await inBatches(others, 3, r => deps.tourFacts(db, {
      tenantId: siteInfo.tenantId, templateId: r.publish_pages!.tour_template_id!, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    }).catch(() => null))
    related = others
      .map((r, i) => {
        const f = otherFacts[i]
        const name = r.publish_pages!.tour_templates!.template_name
        const labels = names.get(r.current_version_id ?? '') ?? {}
        const shared = f ? f.days.filter(d => d.city && mine.has(d.city)).length : 0
        return { shared, link: { title: labels[name] ?? name, path: tourPath(r.slug), ...(f ? { card: cardOf(f, labels) } : {}) } }
      })
      .sort((a, b) => b.shared - a.shared || a.link.title.localeCompare(b.link.title, input.language))
      .slice(0, 3)
      .map(x => x.link)
  }

  let alternates: PagePayload['alternates'] = []
  if (row) {
    const { data: others, error: aErr } = await db.from('publish_page_locales')
      .select(LOCALE_SELECT).eq('page_id', row.page_id).neq('language', input.language)
    if (aErr) throw new Error(`reading other languages: ${aErr.message}`)
    alternates = ((others ?? []) as LocaleRow[])
      .filter(r => siteInfo.languages.includes(r.language) && showable(r, input.preview))
      .map(r => ({ language: r.language, path: pathOf(r) }))
  } else {
    // A synthetic home, listing, About or Contact exists in every language of the site.
    alternates = siteInfo.languages.filter(l => l !== input.language)
      .map(l => ({ language: l, path: standing ?? (kind === 'home' ? '' : 'tours') }))
  }

  // Real reviews only, from the business the agency picked; home, tours and About.
  const rv = reviewsSettingsOf(site.settings)
  const reviews = rv.show && rv.placeId && (kind === 'home' || kind === 'tour' || kind === 'about')
    ? await (deps.reviews ?? placeReviews)(rv.placeId, input.language).catch(() => null)
    : null

  return {
    kind,
    language: input.language,
    path: row ? pathOf(row) : standing ?? (kind === 'home' ? '' : 'tours'),
    ...(kind === 'about' && aboutOf(site.settings, input.language) ? { about: aboutOf(site.settings, input.language)! } : {}),
    ...(kind === 'about' ? { aboutPage: aboutPageOf(site.settings, input.language) } : {}),
    ...(kind === 'contact' ? { interests: destinations.map(d => d.name).slice(0, 8) } : {}),
    ...(reviews ? { reviews } : {}),
    title: tour?.name ?? siteInfo.companyName,
    site: siteInfo,
    alternates,
    tour,
    tours: kind === 'home' || kind === 'listing' ? tourLinks : [],
    ...(kind === 'home' || kind === 'listing' ? { destinations } : {}),
    ...(related.length ? { related } : {}),
    unpublished: row ? !row.is_published : false,
    pageId: row?.page_id ?? null,
  }
}

/** Each tour locale's approved translations ('labels'), by version id — for
 *  the tour names on the home page and the listing. One read for all. */
async function approvedNames(db: Db, tenantId: string, rows: LocaleRow[]): Promise<Map<string, Record<string, string>>> {
  const ids = rows.map(r => r.current_version_id).filter((v): v is string => !!v)
  const out = new Map<string, Record<string, string>>()
  if (ids.length === 0) return out
  const { data, error } = await db.from('publish_versions').select('id, content').in('id', ids).eq('tenant_id', tenantId)
  if (error) throw new Error(`reading tour names: ${error.message}`)
  for (const v of (data ?? []) as Array<{ id: string; content: NarrativeBundle | null }>) {
    const l = v.content?.labels
    if (l?.part === 'labels') out.set(v.id, Object.fromEntries(l.items.map(i => [i.source, i.text])))
  }
  return out
}

// ---------- the sitemap (step 9) ----------

/** The site's published pages, each with its path per published language.
 *  The home page and the tour listing are always there (they exist without
 *  a page row); nothing unpublished, and no tour that is switched off. */
export async function loadSitemap(db: Db, siteId: string, deps: Pick<PageDeps, 'tourFacts'> = { tourFacts: loadTourFacts }): Promise<SitemapData | null> {
  const { data: site, error: sErr } = await db.from('publish_sites').select('id, tenant_id, status, languages, settings').eq('id', siteId).maybeSingle()
  if (sErr) throw new Error(`reading the site: ${sErr.message}`)
  if (!site || site.status === 'suspended') return null
  const languages = site.languages as string[]

  const { data: rows, error } = await db.from('publish_page_locales')
    .select(`${LOCALE_SELECT}, published_at`).eq('site_id', siteId)
  if (error) throw new Error(`reading pages: ${error.message}`)
  const byPage = new Map<string, SitemapData['pages'][number]>()
  const tourLanguages = new Map<string, Set<string>>() // template → the languages its page is published in
  for (const row of (rows ?? []) as Array<LocaleRow & { published_at: string | null }>) {
    if (!languages.includes(row.language) || !showable(row, false)) continue
    const template = row.publish_pages!.tour_template_id
    if (row.publish_pages!.kind === 'tour' && template) tourLanguages.set(template, (tourLanguages.get(template) ?? new Set()).add(row.language))
    const entry = byPage.get(row.page_id) ?? { kind: row.publish_pages!.kind, paths: {}, lastModified: null }
    entry.paths[row.language] = pathOf(row)
    if (row.published_at && (!entry.lastModified || row.published_at > entry.lastModified)) entry.lastModified = row.published_at.slice(0, 10)
    byPage.set(row.page_id, entry)
  }
  const pages = [...byPage.values()]
  const all = (path: string) => Object.fromEntries(languages.map(l => [l, path]))
  if (!pages.some(p => p.kind === 'home')) pages.unshift({ kind: 'home', paths: all(''), lastModified: null })
  if (!pages.some(p => p.kind === 'listing')) pages.splice(1, 0, { kind: 'listing', paths: all('tours'), lastModified: null })
  for (const k of ['about', 'contact'] as const) if (!pages.some(p => p.kind === k)) pages.push({ kind: k, paths: all(k), lastModified: null })

  // Destination pages: one per place a published tour goes, in the languages
  // that tour is published in (the same rule as the pages themselves).
  const templates = [...tourLanguages.keys()]
  const facts = await inBatches(templates, 6, templateId => deps.tourFacts(db, {
    tenantId: site.tenant_id as string, templateId, language: languages[0], indicativeCurrencies: indicativeCurrenciesOf(site.settings),
  }).catch(() => null))
  const places = new Map<string, Set<string>>()
  templates.forEach((templateId, i) => {
    for (const d of facts[i]?.days ?? []) {
      if (!d.city) continue
      const slug = placeSlug(d.city)
      const langs = places.get(slug) ?? new Set<string>()
      tourLanguages.get(templateId)!.forEach(l => langs.add(l))
      places.set(slug, langs)
    }
  })
  for (const [slug, langs] of [...places].sort((a, b) => a[0].localeCompare(b[0]))) {
    pages.push({ kind: 'destination', paths: Object.fromEntries([...langs].map(l => [l, `destinations/${slug}`])), lastModified: null })
  }
  return { languages, pages }
}
