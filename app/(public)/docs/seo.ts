// ============================================
// Docs pages as search engines and AI assistants read them
// ============================================
// Each docs page's title and description come from the same toc.ts entry the
// sidebar and the index render, so the search snippet says what the sidebar
// says. Before this every docs page shared the site's home-page title and
// description — 36 pages that looked identical in results.

import type { Metadata } from 'next'
import { CATEGORIES } from './toc'
import { absoluteUrl, breadcrumbs, buildPageMetadata, ORG_ID, plainDescription, SOFTWARE_ID } from '@/lib/seo/site'

const ITEMS = CATEGORIES.flatMap(c => c.items.map(item => ({ ...item, category: c.label })))

export function docEntry(href: string) {
  return ITEMS.find(item => item.href === href) ?? null
}

function docDescription(title: string, description: string): string {
  return plainDescription(`${title} in Autoura: ${description}`)
}

/** `export const metadata = docMetadata('/docs/…')` in each docs page. */
export function docMetadata(href: string): Metadata {
  const entry = docEntry(href)
  if (!entry) return buildPageMetadata({ title: 'Docs', description: DOCS_INDEX_DESCRIPTION, path: href })
  return buildPageMetadata({
    title: `${entry.title} — Docs`,
    description: docDescription(entry.title, entry.description),
    path: href,
    type: 'article',
  })
}

export const DOCS_INDEX_DESCRIPTION =
  'Autoura documentation: step-by-step guides for tour operators — inbox, itineraries, pricing, quotes, bookings, suppliers, rates, invoices and team settings.'

/** TechArticle + BreadcrumbList for a docs page (rendered by DocPager). */
export function docJsonLd(href: string) {
  const entry = docEntry(href)
  if (!entry) return []
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: entry.title,
      description: docDescription(entry.title, entry.description),
      url: absoluteUrl(href),
      mainEntityOfPage: absoluteUrl(href),
      inLanguage: 'en',
      articleSection: entry.category,
      about: { '@id': SOFTWARE_ID },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@type': 'WebPage', name: 'Autoura documentation', url: absoluteUrl('/docs') },
    },
    breadcrumbs([
      { name: 'Docs', path: '/docs' },
      { name: entry.title, path: href },
    ]),
  ]
}
