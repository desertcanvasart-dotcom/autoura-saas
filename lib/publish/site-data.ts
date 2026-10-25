// ============================================
// Publish — which site a hostname serves, and what is on a page
// ============================================
// Read by the internal endpoints the site renderer calls (contract.ts). Runs
// with the service role, so every query names the site or company it is
// for; the site comes from the hostname, never from anything the visitor
// sent in a body or query of their own.
//
// Step 3: identity and page structure. Facts join the page in step 5.

import type { SiteResolution, PagePayload, PageNarrative, TourFacts } from './contract'
import { loadTourFacts } from './tour-facts'
import { factsHash, renderableNarrative, type NarrativeBundle } from './narrative'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

// ---------- pure rules ----------

/** The hostname as stored in publish_domains: lower case, no port, no trailing dot. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return /^[a-z0-9.-]+$/.test(h) && h.includes('.') ? h : null
}

/**
 * Whether a hostname serves its site. A test hostname always does (it is
 * how a site is seen before launch, and how our own brands run first); a
 * real one only once its domain is verified and the site is live. A
 * suspended site is served nowhere.
 */
export function domainServes(kind: string, domainStatus: string, siteStatus: string): boolean {
  if (siteStatus === 'suspended') return false
  if (kind === 'test') return true
  return domainStatus === 'active' && siteStatus === 'live'
}

export type PathTarget =
  | { kind: 'home' }
  | { kind: 'listing' }
  | { kind: 'tour'; slug: string }
  | { kind: 'page'; slug: string }
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
  if (parts.length === 1 && slugOk(parts[0])) return { kind: 'page', slug: parts[0] }
  return { kind: 'none' }
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

  const siteInfo = {
    id: site.id as string,
    tenantId: site.tenant_id as string,
    archetype: site.archetype,
    companyName: (site.tenants?.company_name as string | undefined) ?? '',
    languages: site.languages as string[],
    brand: (site.brand ?? {}) as Record<string, unknown>,
    identity: identityOf(site.tenants),
  }

  // Every locale of the site in this language: few enough per company to
  // read at once, and the home page, listing and lookups all need them.
  const { data: rows, error: lErr } = await db.from('publish_page_locales')
    .select(LOCALE_SELECT).eq('site_id', input.siteId).eq('language', input.language)
  if (lErr) throw new Error(`reading pages: ${lErr.message}`)
  const locales = ((rows ?? []) as LocaleRow[]).filter(r => showable(r, input.preview))
  const tourLinks = locales
    .filter(r => r.publish_pages!.kind === 'tour')
    .map(r => ({ title: r.publish_pages!.tour_templates!.template_name, path: tourPath(r.slug) }))
    .sort((a, b) => a.title.localeCompare(b.title))

  let row: LocaleRow | undefined
  if (target.kind === 'home') row = locales.find(r => r.publish_pages!.kind === 'home')
  else if (target.kind === 'tour') row = locales.find(r => r.publish_pages!.kind === 'tour' && r.slug === target.slug)
  else if (target.kind === 'page') row = locales.find(r => !['tour', 'home', 'listing'].includes(r.publish_pages!.kind) && r.slug === target.slug)
  else if (target.kind === 'listing') row = locales.find(r => r.publish_pages!.kind === 'listing')

  // The home page and the tour listing exist even before a page row is made
  // for them: a site with only tour pages still has a front door.
  if (!row && target.kind !== 'home' && target.kind !== 'listing') return null

  const kind: PagePayload['kind'] = row?.publish_pages?.kind ?? (target.kind === 'home' ? 'home' : 'listing')
  const templateId = kind === 'tour' ? row?.publish_pages?.tour_template_id ?? null : null
  let tour: PagePayload['tour'] = null
  if (templateId) {
    const name = row!.publish_pages!.tour_templates!.template_name
    const facts = await deps.tourFacts(db, {
      tenantId: siteInfo.tenantId, templateId, language: input.language,
      indicativeCurrencies: indicativeCurrenciesOf(site.settings),
    })
    let narrative: PageNarrative | null = null
    if (row!.current_version_id) {
      const { data: version, error: vErr } = await db.from('publish_versions').select('content, facts_snapshot')
        .eq('id', row!.current_version_id).eq('tenant_id', siteInfo.tenantId).maybeSingle()
      if (vErr) throw new Error(`reading the published text: ${vErr.message}`)
      const r = renderableNarrative((version?.content as NarrativeBundle) ?? null, facts, name)
      // renderableNarrative keeps only slots the tour can fill — all of them known keys.
      narrative = { overview: r.overview, highlights: r.highlights, days: r.days, seo: r.seo } as PageNarrative
      deps.onNarrative?.({
        tenantId: siteInfo.tenantId, pageId: row!.page_id, templateId, tourName: name, language: input.language,
        published: row!.is_published, stale: r.stale,
        factsChanged: Boolean(version?.facts_snapshot?.hash && version.facts_snapshot.hash !== factsHash(facts)),
      })
    }
    tour = { templateId, name, facts, narrative }
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
    // A synthetic home or listing exists in every language of the site.
    alternates = siteInfo.languages.filter(l => l !== input.language)
      .map(l => ({ language: l, path: kind === 'home' ? '' : 'tours' }))
  }

  return {
    kind,
    language: input.language,
    path: row ? pathOf(row) : (kind === 'home' ? '' : 'tours'),
    title: tour?.name ?? siteInfo.companyName,
    site: siteInfo,
    alternates,
    tour,
    tours: kind === 'home' || kind === 'listing' ? tourLinks : [],
    unpublished: row ? !row.is_published : false,
  }
}
