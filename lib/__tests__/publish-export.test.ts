import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildSiteExport, csv, pageFile, redirectFiles, type ExportDeps } from '@/lib/publish/export'
import type { PagePayload, TourFacts } from '@/lib/publish/contract'
import { formatPrice } from '../../sites/themes/blocks/format'

// ============================================================================
// The whole website as one download (step 12, PLAN §14). The plan's test:
// export a fixture site, unzip, and find every published page in every
// language, every photo and every redirect — with HTML that opens without the
// renderer (no scripts; stylesheets and fonts bundled, linked relatively).
// ============================================================================

const T = 'tenant-a', SITE = 'site-a'
type Row = Record<string, unknown>

function makeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      const exec = () => ({ data: (tables[table] ?? []).filter(r => filters.every(f => f(r))), error: null })
      const q: Record<string, unknown> = {
        select: () => q, order: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        maybeSingle: async () => ({ data: exec().data[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res(exec()),
      }
      return q
    },
  }
}

const FACTS = {
  durationDays: 1, durationNights: 0, images: [],
  days: [{ day: 1, title: 'Giza', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Great Sphinx'] }],
  mainAttractions: [], highlights: ['Camel ride'], inclusions: ['Guide'], exclusions: ['Tips'], accommodation: [],
  groupSize: null, departureDays: ['sat'], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 99.2, tier: 'standard', tierLabel: 'Standard' }, byNationality: null, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
} as unknown as TourFacts

function payload(lang: string, path: string): PagePayload | null {
  const base = {
    language: lang, path, alternates: [], tours: [] as PagePayload['tours'], unpublished: false, pageId: null,
    site: { id: SITE, tenantId: T, archetype: 'modern' as const, companyName: 'Sunrise Travel', languages: ['en', 'fr'], brand: {}, publicHost: null,
      identity: { tagline: null, logoUrl: null, phone: null, email: null, whatsapp: null, address: null, licenseNumber: null } },
  }
  const giza = lang === 'en' ? 'tours/giza-day' : 'tours/journee-giza'
  if (path === '') return { ...base, kind: 'home', title: 'Sunrise Travel', tour: null, tours: [{ title: 'Giza', path: giza }], destinations: [{ name: 'Giza', path: 'destinations/giza', count: 1 }] }
  if (path === 'tours') return { ...base, kind: 'listing', title: 'Tours', tour: null, tours: [{ title: 'Giza', path: giza }] }
  if (path === 'destinations/giza') return { ...base, kind: 'destination', title: 'Giza', tour: null, destination: { name: 'Giza', slug: 'giza' }, tours: [{ title: 'Giza', path: giza }] }
  if (path === giza) return { ...base, kind: 'tour', title: 'Giza day', tour: { templateId: '00000000-0000-4000-8000-0000000000dd', name: 'Giza day', facts: FACTS,
    narrative: { overview: [{ type: 'text', text: 'Stand before the Sphinx.' }], highlights: null, days: [], seo: null } } }
  return null
}

const HTML = (lang: string) => `<!doctype html><html lang="${lang}"><head><link rel="stylesheet" href="/_next/static/chunks/site.css"><link rel="preload" as="script" href="/_next/static/chunks/a.js"><script src="/_next/static/chunks/a.js"></script></head>
<body><a href="/${lang}/tours">Tours</a> <a href="/${lang}/tours/giza-day#enquire">Giza</a> <a href="/${lang}">Home</a> <a href="https://wa.me/1">WA</a><script>self.__next_f=[]</script></body></html>`

const deps: ExportDeps = {
  page: async ({ language, path }) => payload(language, path),
  fetchText: async url => url.endsWith('.css') ? '@font-face{src:url(/_next/static/media/outfit.woff2)} body{color:red}' : url.includes('/fr') ? HTML('fr') : HTML('en'),
  fetchBytes: async () => new Uint8Array([1, 2, 3]),
  media: async () => new Uint8Array([9, 9]),
  now: () => new Date('2026-10-28T10:00:00Z'),
}

const db = () => makeDb({
  publish_sites: [{ id: SITE, tenant_id: T, archetype: 'modern', status: 'draft', languages: ['en', 'fr'], brand: { fontPair: 'sleek' }, settings: {}, tenants: { company_name: 'Sunrise Travel' } }],
  publish_domains: [{ site_id: SITE, hostname: 'sunrise.up.railway.app', kind: 'test', status: 'active' }],
  publish_glossary: [{ tenant_id: T, term_key: 'giza', kind: 'site', language: 'fr', spelling: 'Gizeh' }],
  publish_redirects: [{ site_id: SITE, from_path: '/old-giza', to_path: '/en/tours/giza-day', status_code: 301 }],
  publish_page_locales: [
    { site_id: SITE, language: 'en', slug: 'giza-day', is_published: true, publish_pages: { kind: 'tour' } },
    { site_id: SITE, language: 'fr', slug: 'journee-giza', is_published: true, publish_pages: { kind: 'tour' } },
    { site_id: SITE, language: 'en', slug: 'secret-draft', is_published: false, publish_pages: { kind: 'tour' } },
  ],
  publish_media: [{ site_id: SITE, storage_path: `${T}/hotels/lotus.jpg`, width: 1200, height: 800, alt: { en: 'The Lotus Inn', fr: "L'hôtel Lotus" }, is_placeholder: false }],
  publish_enquiries: [{ tenant_id: T, created_at: '2026-10-27T18:45:00Z', source: 'web_form', language: 'en', landing_url: 'https://sunrise.example/en?utm_source=g', campaign: 'autumn',
    utm: { source: 'g' }, dates: { from: '2027-03' }, travellers: 2, message: '=SUM(A1) please', tour_templates: { template_name: 'Giza day' },
    clients: { first_name: 'Lena', last_name: 'Fischer', email: 'lena@example.com', phone: null } }],
})

describe('the website as one download', () => {
  it('has every published page in every language — as Markdown and as standalone HTML — and nothing unpublished', async () => {
    const { zip, filename, counts } = await buildSiteExport(db() as never, T, deps)
    expect(filename).toBe('sunrise-travel-website-2026-10-28.zip')
    const z = await JSZip.loadAsync(zip)
    const files = Object.keys(z.files).filter(f => !z.files[f].dir).sort()
    for (const lang of ['en', 'fr']) {
      const tour = lang === 'en' ? 'tours/giza-day' : 'tours/journee-giza'
      for (const path of ['', 'tours', tour, 'destinations/giza']) {
        expect(files, `${lang}/${path}`).toContain(pageFile(lang, path, 'md'))
        expect(files, `${lang}/${path}`).toContain(pageFile(lang, path, 'html'))
      }
    }
    expect(files.join(' ')).not.toContain('secret-draft')
    expect(counts).toMatchObject({ pages: 8, html: 8, media: 1, leads: 1, redirects: 1 })
  })

  it('the HTML opens without the renderer: no scripts, stylesheet and font bundled, links between pages relative', async () => {
    const z = await JSZip.loadAsync((await buildSiteExport(db() as never, T, deps)).zip)
    const html = await z.file('pages/en/tours/giza-day.html')!.async('string')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain('rel="preload"')
    expect(html).toContain('href="../../../assets/site.css"')
    expect(html).toContain('href="../../../pages/en/tours.html"')
    expect(html).toContain('href="../../../pages/en/tours/giza-day.html#enquire"')
    expect(html).toContain('href="../../../pages/en/index.html"')
    expect(html).toContain('href="https://wa.me/1"')
    expect(await z.file('assets/site.css')!.async('string')).toContain('url(outfit.woff2)')
    expect(z.file('assets/outfit.woff2')).not.toBeNull()
  })

  it('the Markdown carries the approved text and the facts, with the price as shown', async () => {
    const z = await JSZip.loadAsync((await buildSiteExport(db() as never, T, deps)).zip)
    const md = await z.file('pages/en/tours/giza-day.md')!.async('string')
    expect(md).toContain('title: "Giza day"')
    expect(md).toContain(`price_from: "${formatPrice(99.2, 'EUR', 'en')}"`) // as the page writes it — rounded up
    expect(md).toContain('Stand before the Sphinx.')
    expect(md).toContain('- Guide')
    expect(md).toContain('Visits: Great Sphinx')
  })

  it('media, redirects in three formats, leads (safe for spreadsheets) and site.json', async () => {
    const z = await JSZip.loadAsync((await buildSiteExport(db() as never, T, deps)).zip)
    expect(z.file('media/hotels/lotus.jpg')).not.toBeNull()
    expect(await z.file('media.csv')!.async('string')).toContain("media/hotels/lotus.jpg,1200,800,The Lotus Inn,L'hôtel Lotus")
    expect(await z.file('_redirects')!.async('string')).toBe('/old-giza /en/tours/giza-day 301\n')
    expect(await z.file('nginx.conf')!.async('string')).toBe('location = /old-giza { return 301 /en/tours/giza-day; }\n')
    const leads = await z.file('leads.csv')!.async('string')
    expect(leads).toContain('Lena Fischer,lena@example.com')
    expect(leads).toContain("'=SUM(A1) please") // a formula is never run by a spreadsheet
    const site = JSON.parse(await z.file('site.json')!.async('string'))
    expect(site).toMatchObject({ company: 'Sunrise Travel', archetype: 'modern', languages: ['en', 'fr'], glossary: [{ spelling: 'Gizeh' }] })
    expect(site.pages).toHaveLength(8)
  })
})

describe('writers', () => {
  it('csv quotes what needs quoting', () => {
    expect(csv([['a,b', 'say "hi"', null, 3]])).toBe('"a,b","say ""hi""",,3\n')
  })
  it('no redirects, empty files', () => {
    expect(redirectFiles([])['_redirects']).toBe('')
  })
})
