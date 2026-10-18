// ============================================
// The public site, as search engines and AI assistants read it
// ============================================
// One place for what the marketing site says about itself in machine-readable
// form: the canonical URL, the brand facts, the page metadata every public
// page is built from, and the schema.org entities they share. Entities link
// by @id (one Organization, referenced from the WebSite, the product, every
// article) so crawlers see one connected graph instead of islands.
//
// Facts here must match what the pages show — schema that disagrees with
// the visible content is ignored, or treated as manipulation.

import type { Metadata } from 'next'
import { PRICING_TIERS } from '@/lib/pricing-config'

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net').replace(/\/$/, '')
export const SITE_NAME = 'Autoura'
export const DEFAULT_OG_IMAGE = '/og.png'

export const ORG_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`
export const SOFTWARE_ID = `${SITE_URL}/#software`

export const BRAND = {
  name: 'Autoura',
  tagline: 'Tour operator software, from WhatsApp to invoice',
  description:
    'Autoura is software for tour operators and DMCs: it turns WhatsApp and email enquiries into priced itineraries, branded quotes, bookings and invoices in one place.',
  email: 'hello@getautoura.net',
  supportEmail: 'support@getautoura.net',
  logo: `${SITE_URL}/get-autoura-logo.png`,
  knowsAbout: [
    'Tour operator software', 'Destination management company (DMC) operations', 'Itinerary pricing',
    'B2B rate sheets for travel partners', 'WhatsApp customer messaging', 'Travel quotes and invoicing',
  ],
} as const

/** An absolute URL for a site path ('/pricing' → 'https://…/pricing'). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export interface PageMetadataInput {
  /** Page title without the brand (the layout template adds " · Autoura"). */
  title: string
  /** 120–160 characters, written for a person reading search results. */
  description: string
  /** The page's own path, e.g. '/pricing'. Used for canonical and og:url. */
  path: string
  type?: 'website' | 'article'
  image?: { url: string; alt: string; width?: number; height?: number } | null
  publishedTime?: string | null
  modifiedTime?: string | null
  authors?: string[]
  locale?: 'en_US' | 'ja_JP'
  /** Keep the page out of search results (it still renders). */
  noindex?: boolean
}

/**
 * Every public page's metadata, built the same way: title, description,
 * canonical, OpenGraph (with its own url, site name, locale and image) and a
 * Twitter card. Pages that set only a title and description inherited the
 * home page's share card — the wrong url and title on every shared link.
 */
export function buildPageMetadata(p: PageMetadataInput): Metadata {
  const image = p.image ?? { url: DEFAULT_OG_IMAGE, alt: `${SITE_NAME} — ${BRAND.tagline}`, width: 1200, height: 630 }
  const fullTitle = `${p.title} · ${SITE_NAME}`
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: p.path },
    ...(p.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: p.type ?? 'website',
      siteName: SITE_NAME,
      title: fullTitle,
      description: p.description,
      url: p.path,
      locale: p.locale ?? 'en_US',
      images: [{ url: image.url, alt: image.alt, ...(image.width ? { width: image.width, height: image.height } : {}) }],
      ...(p.type === 'article'
        ? {
            publishedTime: p.publishedTime ?? undefined,
            modifiedTime: p.modifiedTime ?? undefined,
            authors: p.authors && p.authors.length ? p.authors : undefined,
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: p.description,
      images: [{ url: image.url, alt: image.alt }],
    },
  }
}

/** The site-wide graph: the company, the website, and the product. */
export function siteGraph() {
  const priced = Object.values(PRICING_TIERS).filter(t => t.publiclyPriced && typeof t.monthlyPrice === 'number')
  const prices = priced.map(t => t.monthlyPrice as number)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: BRAND.name,
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: BRAND.logo },
        description: BRAND.description,
        email: BRAND.email,
        contactPoint: [
          { '@type': 'ContactPoint', contactType: 'sales', email: BRAND.email, url: absoluteUrl('/contact'), availableLanguage: ['English', 'Japanese'] },
          { '@type': 'ContactPoint', contactType: 'customer support', email: BRAND.supportEmail, availableLanguage: ['English'] },
        ],
        knowsAbout: BRAND.knowsAbout,
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: BRAND.name,
        url: SITE_URL,
        description: BRAND.description,
        inLanguage: ['en', 'ja'],
        publisher: { '@id': ORG_ID },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': SOFTWARE_ID,
        name: BRAND.name,
        url: SITE_URL,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Tour operator software',
        operatingSystem: 'Web',
        description: BRAND.description,
        publisher: { '@id': ORG_ID },
        featureList: [
          'WhatsApp and email enquiries in one inbox',
          'AI itinerary drafting from a client conversation',
          'Pricing from your own rate sheets (hotels, cruises, guides, transport, entrance fees)',
          'Branded B2C quotes and B2B partner rate sheets',
          'Bookings, supplier confirmations and operations tasks',
          'Invoices, payments, expenses and per-trip profit & loss',
        ],
        ...(prices.length
          ? {
              offers: {
                '@type': 'AggregateOffer',
                priceCurrency: 'USD',
                lowPrice: Math.min(...prices),
                highPrice: Math.max(...prices),
                offerCount: priced.length,
                url: absoluteUrl('/pricing'),
                description: 'Monthly plans; larger plans are priced on request. Free trial, no card required.',
              },
            }
          : {}),
      },
    ],
  }
}

/** A BreadcrumbList for a page: [{name, path}] from the home page down. */
export function breadcrumbs(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...items].map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  }
}

/** Text for a meta description: tags stripped, spaces collapsed, cut at a word near `max`. */
export function plainDescription(text: string | null | undefined, max = 158): string {
  const plain = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`
}
