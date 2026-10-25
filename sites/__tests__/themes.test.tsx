import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { TOUR_SECTIONS } from '../themes/types'
import { ARCHETYPES } from '@/lib/publish/brand'
import type { PagePayload } from '@/lib/publish/contract'

// ============================================================================
// The archetype themes (docs/publish/PLAN.md §7, step 4). Each is a package —
// frame, pages, tour section order — and none may print a fact it was not
// given: no price, number or currency appears unless it came from the page
// payload (the module's one rule).
// ============================================================================

const identity = { tagline: 'Journeys shaped around you', logoUrl: null, phone: '+20 2 1234 5678', email: 'hello@co.test',
  whatsapp: '+20 100 000 0000', address: 'Cairo', licenseNumber: 'ETAA 77' }
const blank = { tagline: null, logoUrl: null, phone: null, email: null, whatsapp: null, address: null, licenseNumber: null }

function payload(over: Partial<PagePayload> = {}, archetype: PagePayload['site']['archetype'] = 'private_journeys'): PagePayload {
  return {
    kind: 'home', language: 'fr', path: '', title: 'Co',
    site: { id: '00000000-0000-4000-8000-0000000000bb', tenantId: '00000000-0000-4000-8000-0000000000aa', archetype,
      companyName: 'Co Voyages', languages: ['en', 'fr'], brand: {}, identity },
    alternates: [{ language: 'en', path: '' }],
    tour: null,
    tours: [{ title: 'Nile classic', path: 'tours/croisiere' }, { title: 'Cairo', path: 'tours/le-caire' }],
    unpublished: false,
    ...over,
  }
}

function render(archetype: PagePayload['site']['archetype'], page: PagePayload, preview = false): string {
  const theme = THEMES[archetype]
  return renderToStaticMarkup(<theme.Frame page={page} preview={preview}><theme.Page page={page} preview={preview} /></theme.Frame>)
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ')

describe('the theme packages', () => {
  it('every archetype has a theme, and each tour page places every section exactly once', () => {
    for (const a of ARCHETYPES) {
      const theme = THEMES[a]
      expect(theme.archetype).toBe(a)
      expect([...theme.tourSections].sort()).toEqual([...TOUR_SECTIONS].sort())
    }
  })
  it('each archetype orders the tour page by how it sells', () => {
    const pj = THEMES.private_journeys.tourSections
    const tv = THEMES.transparent_value.tourSections
    expect(pj.indexOf('itinerary')).toBeLessThan(pj.indexOf('price')) // the journey, then the price
    expect(pj[pj.length - 1]).toBe('enquiry') // the consultation last
    expect(tv.indexOf('price')).toBeLessThan(tv.indexOf('itinerary')) // the price up front
    expect(tv.indexOf('inclusions')).toBeLessThan(tv.indexOf('itinerary')) // and what it buys
  })
})

for (const archetype of ARCHETYPES) {
  describe(archetype, () => {
    it('home: the company from its records, its tours linked in the page\'s language', () => {
      const html = render(archetype, payload({}, archetype))
      expect(html).toContain('Co Voyages')
      expect(html).toContain('href="/fr/tours/croisiere"')
      expect(html).toContain('href="/fr/tours/le-caire"')
      expect(html).toContain('ETAA 77')
    })
    it('language links go to this page in the other language — real URLs, no script', () => {
      const page = payload({ kind: 'tour', path: 'tours/croisiere', title: 'Nile classic', tours: [],
        tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Nile classic' },
        alternates: [{ language: 'en', path: 'tours/nile-classic' }] }, archetype)
      const html = render(archetype, page)
      expect(html).toContain('href="/en/tours/nile-classic" hrefLang="en" lang="en"')
      expect(html).not.toMatch(/<script|onclick/i)
    })
    it('prints no price, number or currency it was not given', () => {
      for (const kind of ['home', 'listing', 'tour'] as const) {
        const page = payload({ kind, site: { ...payload({}, archetype).site, identity: { ...identity, phone: null, whatsapp: null, licenseNumber: null } } }, archetype)
        const words = text(render(archetype, page))
        expect(words, kind).not.toMatch(/[€$£]|\bEGP\b|\bUSD\b|\bEUR\b/)
        expect(words, kind).not.toMatch(/\d/)
      }
    })
    it('no contact the company has not given: no empty mailto, no WhatsApp without a number', () => {
      const html = render(archetype, payload({ site: { ...payload({}, archetype).site, identity: blank } }, archetype))
      expect(html).not.toContain('mailto:')
      expect(html).not.toContain('wa.me')
      expect(html).not.toContain('tel:')
    })
    it('a test hostname says it is a preview; an unpublished page says so', () => {
      expect(render(archetype, payload({}, archetype), true)).toContain('Preview — this site is not public')
      const draft = payload({ kind: 'tour', title: 'Soon', unpublished: true, tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Soon' } }, archetype)
      expect(render(archetype, draft)).toContain('Not yet published')
    })
    it('an empty site says so instead of showing an empty grid', () => {
      expect(render(archetype, payload({ tours: [] }, archetype))).toContain('Our journeys will be listed here soon.')
    })
  })
}

describe('the brand layer is configuration, not markup', () => {
  it('two companies on one archetype with different brands get the same markup — the brand is only CSS variables', () => {
    const a = payload()
    const b = payload({ site: { ...payload().site, brand: { palette: { primary: '#123456', accent: '#654321', ink: '#000000', surface: '#ffffff' }, fontPair: 'modern' } } })
    expect(render('private_journeys', a)).toBe(render('private_journeys', b))
  })
})
