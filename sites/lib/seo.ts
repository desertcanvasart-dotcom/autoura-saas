// ============================================
// What search engines are told (step 9, PLAN §12)
// ============================================
// Pure builders from the page payload and the site's records, so every rule
// is tested without a server:
//   * the canonical address and hreflang links (+ x-default = English), on
//     the site's primary hostname only;
//   * JSON-LD — TravelAgency, TouristTrip with its Offer(s), BreadcrumbList —
//     stating ONLY what the payload holds. The offer's price is the very
//     number the page shows (shownAmount), and EU / other-nationality prices
//     appear as two offers only when the rates differ (Q5). No reviews or
//     ratings (Phase 1);
//   * robots.txt per hostname: open only on a live site's primary hostname;
//   * a sitemap index and one sitemap per language, with hreflang.

import type { PagePayload, SiteResolution, SitemapData } from '@/lib/publish/contract'
import { narrativeText } from '../themes/blocks/narrative'
import { shownAmount } from '../themes/blocks/format'
import { t } from '../i18n/strings'

/** The default for a visitor whose language the site does not have. */
const X_DEFAULT_LANGUAGE = 'en'

export function pageUrl(host: string, language: string, path: string): string {
  return `https://${host}/${language}${path ? `/${path}` : ''}`
}

/** canonical + hreflang, or null when the site has no primary hostname yet. */
export function alternateLinks(page: PagePayload): { canonical: string; languages: Record<string, string> } | null {
  const host = page.site.publicHost
  if (!host) return null
  const versions = [{ language: page.language, path: page.path }, ...page.alternates]
  const languages: Record<string, string> = {}
  for (const v of versions) languages[v.language] = pageUrl(host, v.language, v.path)
  const fallback = versions.find(v => v.language === X_DEFAULT_LANGUAGE) ?? versions[0]
  languages['x-default'] = pageUrl(host, fallback.language, fallback.path)
  return { canonical: pageUrl(host, page.language, page.path), languages }
}

type Json = Record<string, unknown>

function agency(page: PagePayload, host: string | null): Json {
  const id = page.site.identity
  const org: Json = {
    '@type': 'TravelAgency',
    '@id': host ? `https://${host}/#agency` : undefined,
    name: page.site.companyName,
    url: host ? `https://${host}/${page.language}` : undefined,
    logo: id.logoUrl ?? undefined,
    telephone: id.phone ?? undefined,
    email: id.email ?? undefined,
    address: id.address ?? undefined,
    identifier: id.licenseNumber ?? undefined,
    slogan: id.tagline ?? undefined,
  }
  return prune(org)
}

function prune(o: Json): Json {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

/** The JSON-LD blocks for a page — each one a statement of record, never text written for it. */
export function structuredData(page: PagePayload): Json[] {
  const host = page.site.publicHost ?? null
  const org = agency(page, host)
  const blocks: Json[] = [{ '@context': 'https://schema.org', ...org }]
  if (page.kind !== 'tour' || !page.tour) return blocks

  const facts = page.tour.facts
  const url = host ? pageUrl(host, page.language, page.path) : undefined
  const description = narrativeText(page.tour.narrative?.overview, facts, page.language) ?? page.tour.narrative?.seo?.description ?? undefined
  const trip: Json = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: page.tour.name,
    url,
    description,
    image: facts?.images.length ? facts.images : undefined,
    provider: host ? { '@id': `https://${host}/#agency` } : { '@type': 'TravelAgency', name: page.site.companyName },
  }
  if (facts?.days.length) {
    trip.itinerary = {
      '@type': 'ItemList',
      numberOfItems: facts.days.length,
      itemListElement: facts.days.map((d, i) => prune({
        '@type': 'ListItem',
        position: i + 1,
        name: `${t(page.language, 'day')} ${d.day}${d.title ? ` — ${d.title}` : d.city ? ` — ${d.city}` : ''}`,
      })),
    }
  }
  const price = facts?.price
  if (price?.status === 'available') {
    const offer = (amount: number, name: string | undefined): Json => prune({
      '@type': 'Offer',
      name,
      price: shownAmount(amount),
      priceCurrency: price.currency,
      url,
      availability: 'https://schema.org/InStock',
    })
    if (price.byNationality) {
      trip.offers = [offer(price.byNationality.eu, t(page.language, 'euPassport')), offer(price.byNationality.other, t(page.language, 'otherNationalities'))]
    } else if (price.from) {
      trip.offers = offer(price.from.perPerson, undefined)
    }
  }
  blocks.push(prune(trip))

  if (host) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: page.site.companyName, item: pageUrl(host, page.language, '') },
        { '@type': 'ListItem', position: 2, name: t(page.language, 'tours'), item: pageUrl(host, page.language, 'tours') },
        { '@type': 'ListItem', position: 3, name: page.tour.name, item: url },
      ],
    })
  }
  return blocks
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export function jsonLdScript(block: Json): string {
  return JSON.stringify(block).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** Whether this hostname may be crawled: a live site's primary hostname. */
export function indexable(r: SiteResolution): boolean {
  return !r.preview && r.domain.kind === 'primary' && r.site.status === 'live'
}

export function robotsTxt(r: SiteResolution, host: string): string {
  if (!indexable(r)) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://${host}/sitemap.xml\n`
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function sitemapIndexXml(host: string, data: SitemapData): string {
  const items = data.languages.map(l => `  <sitemap><loc>https://${host}/sitemaps/${l}.xml</loc></sitemap>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`
}

/** One language's pages, each with its versions in the others (hreflang). */
export function languageSitemapXml(host: string, data: SitemapData, language: string): string {
  const urls = data.pages.filter(p => p.paths[language] !== undefined).map(p => {
    const alternates = Object.entries(p.paths)
      .map(([l, path]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${xml(pageUrl(host, l, path))}"/>`)
    const fallback = p.paths[X_DEFAULT_LANGUAGE] !== undefined ? X_DEFAULT_LANGUAGE : language
    alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(pageUrl(host, fallback, p.paths[fallback]))}"/>`)
    return [
      '  <url>',
      `    <loc>${xml(pageUrl(host, language, p.paths[language]))}</loc>`,
      ...(p.lastModified ? [`    <lastmod>${p.lastModified}</lastmod>`] : []),
      ...alternates,
      '  </url>',
    ].join('\n')
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}
