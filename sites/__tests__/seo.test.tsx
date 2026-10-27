import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { alternateLinks, indexable, jsonLdScript, languageSitemapXml, robotsTxt, sitemapIndexXml, structuredData } from '../lib/seo'
import { PriceSection } from '../themes/blocks/TourFacts'
import type { PagePayload, SiteResolution, SitemapData, TourFacts } from '@/lib/publish/contract'

// ============================================================================
// What search engines are told (step 9, PLAN §12). The rules proved here:
//   · the canonical address is the primary hostname, with every language
//     version and x-default (English); nothing before a primary exists;
//   · JSON-LD states only the payload — the offer's price is the number the
//     page shows, EU / other nationalities are two offers only when they
//     differ, and a price on request has no offer at all;
//   · robots.txt opens only a live site's primary hostname;
//   · each language's sitemap lists its pages with their hreflang versions.
// ============================================================================

const FACTS: TourFacts = {
  durationDays: 2, durationNights: 1, images: ['https://img.example/saqqara.jpg'],
  days: [
    { day: 1, title: 'Saqqara', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Step Pyramid'] },
    { day: 2, title: null, city: 'Giza', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
  ],
  mainAttractions: [], highlights: [], inclusions: ['Guide'], exclusions: [], accommodation: [],
  groupSize: null, departureDays: [], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 99.89, tier: 'budget', tierLabel: 'Budget' }, byNationality: null, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
} as unknown as TourFacts

function tourPage(over: Partial<PagePayload> = {}, facts: TourFacts = FACTS, host: string | null = 'www.co.example'): PagePayload {
  return {
    kind: 'tour', language: 'fr', path: 'tours/saqqara', title: 'Saqqara',
    site: { id: '00000000-0000-4000-8000-0000000000bb', tenantId: '00000000-0000-4000-8000-0000000000aa', archetype: 'private_journeys',
      companyName: 'Co Voyages', languages: ['en', 'fr'], brand: {}, publicHost: host,
      identity: { tagline: null, logoUrl: null, phone: '+20 2 1234 5678', email: 'hello@co.example', whatsapp: null, address: 'Cairo', licenseNumber: 'ETAA 77' } },
    alternates: [{ language: 'en', path: 'tours/saqqara-en' }],
    tour: { templateId: '00000000-0000-4000-8000-0000000000dd', name: 'Saqqara', facts, narrative: null },
    tours: [], unpublished: false, pageId: null, ...over,
  }
}

const trip = (page: PagePayload) => structuredData(page).find(b => b['@type'] === 'TouristTrip')!

describe('canonical and hreflang', () => {
  it('point at the primary hostname, every language version, and English as x-default', () => {
    expect(alternateLinks(tourPage())).toEqual({
      canonical: 'https://www.co.example/fr/tours/saqqara',
      languages: {
        fr: 'https://www.co.example/fr/tours/saqqara',
        en: 'https://www.co.example/en/tours/saqqara-en',
        'x-default': 'https://www.co.example/en/tours/saqqara-en',
      },
    })
  })
  it('are left out until the site has a primary hostname', () => {
    expect(alternateLinks(tourPage({}, FACTS, null))).toBeNull()
  })
})

describe('structured data', () => {
  it('the offer states the very price the page shows', () => {
    const page = tourPage()
    const offer = trip(page).offers as Record<string, unknown>
    expect(offer).toMatchObject({ '@type': 'Offer', price: 100, priceCurrency: 'EUR', url: 'https://www.co.example/fr/tours/saqqara' })
    const html = renderToStaticMarkup(<PriceSection facts={FACTS} lang="en" variant="editorial" />)
    expect(html).toContain('€100')
  })

  it('EU passport holders and other nationalities are two offers when the rates differ', () => {
    const facts = { ...FACTS, price: { ...FACTS.price, byNationality: { eu: 440.2, other: 425.5 } } } as TourFacts
    expect(trip(tourPage({}, facts)).offers).toEqual([
      expect.objectContaining({ name: 'Titulaires d’un passeport de l’UE', price: 441 }),
      expect.objectContaining({ name: 'Autres nationalités', price: 426 }),
    ])
  })

  it('a price on request has no offer at all', () => {
    const facts = { ...FACTS, price: { ...FACTS.price, status: 'on_request', from: null, byNationality: null } } as unknown as TourFacts
    expect(trip(tourPage({}, facts)).offers).toBeUndefined()
  })

  it('the agency, the days and the breadcrumb come from the records; no reviews or ratings', () => {
    const blocks = structuredData(tourPage())
    expect(blocks.map(b => b['@type'])).toEqual(['TravelAgency', 'TouristTrip', 'BreadcrumbList'])
    expect(blocks[0]).toMatchObject({ name: 'Co Voyages', telephone: '+20 2 1234 5678', identifier: 'ETAA 77', address: 'Cairo' })
    expect(trip(tourPage()).itinerary).toMatchObject({ numberOfItems: 2, itemListElement: [{ name: 'Jour 1 — Saqqara' }, { name: 'Jour 2 — Giza' }] })
    expect(JSON.stringify(blocks)).not.toMatch(/Review|Rating/)
  })

  it('without a primary hostname: no breadcrumb and no invented address', () => {
    const blocks = structuredData(tourPage({}, FACTS, null))
    expect(blocks.map(b => b['@type'])).toEqual(['TravelAgency', 'TouristTrip'])
    expect(JSON.stringify(blocks)).not.toContain('https://www.')
  })

  it('a home page states only the agency', () => {
    expect(structuredData(tourPage({ kind: 'home', tour: null, path: '' })).map(b => b['@type'])).toEqual(['TravelAgency'])
  })

  it('is safe inside a script tag', () => {
    expect(jsonLdScript({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>')
  })
})

const resolution = (over: Partial<SiteResolution> & { status?: 'draft' | 'live' } = {}): SiteResolution => ({
  site: { id: 's', tenantId: 't', archetype: 'private_journeys', status: over.status ?? 'live', languages: ['en', 'fr'], companyName: 'Co', brand: {} },
  domain: { hostname: 'www.co.example', kind: 'primary' }, primaryHost: 'www.co.example', preview: false, redirects: [], ...over,
})

describe('robots.txt', () => {
  it('a live site on its primary hostname is open, with its sitemap', () => {
    expect(indexable(resolution())).toBe(true)
    expect(robotsTxt(resolution(), 'www.co.example')).toBe('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://www.co.example/sitemap.xml\n')
  })
  it('a test hostname, or a site not yet live, is closed', () => {
    expect(robotsTxt(resolution({ preview: true, domain: { hostname: 'x.up.railway.app', kind: 'test' } }), 'x.up.railway.app')).toBe('User-agent: *\nDisallow: /\n')
    expect(robotsTxt(resolution({ status: 'draft' }), 'www.co.example')).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('sitemaps', () => {
  const data: SitemapData = {
    languages: ['en', 'fr'],
    pages: [
      { kind: 'home', paths: { en: '', fr: '' }, lastModified: null },
      { kind: 'tour', paths: { en: 'tours/saqqara', fr: 'tours/saqqara-fr' }, lastModified: '2026-10-27' },
      { kind: 'tour', paths: { fr: 'tours/only-french' }, lastModified: null },
    ],
  }
  it('the index names one sitemap per language', () => {
    const x = sitemapIndexXml('www.co.example', data)
    expect(x).toContain('<loc>https://www.co.example/sitemaps/en.xml</loc>')
    expect(x).toContain('<loc>https://www.co.example/sitemaps/fr.xml</loc>')
  })
  it("a language's sitemap lists its pages with every version and x-default", () => {
    const en = languageSitemapXml('www.co.example', data, 'en')
    expect(en).toContain('<loc>https://www.co.example/en/tours/saqqara</loc>')
    expect(en).toContain('<lastmod>2026-10-27</lastmod>')
    expect(en).toContain('hreflang="fr" href="https://www.co.example/fr/tours/saqqara-fr"')
    expect(en).toContain('hreflang="x-default" href="https://www.co.example/en/tours/saqqara"')
    expect(en).not.toContain('only-french')
    const fr = languageSitemapXml('www.co.example', data, 'fr')
    expect(fr).toContain('<loc>https://www.co.example/fr/tours/only-french</loc>')
    expect(fr).toContain('hreflang="x-default" href="https://www.co.example/fr/tours/only-french"')
  })
})
