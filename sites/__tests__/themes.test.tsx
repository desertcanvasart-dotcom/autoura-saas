import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { TOUR_SECTIONS } from '../themes/types'
import { ARCHETYPES } from '@/lib/publish/brand'
import type { PagePayload, PageNarrative, TourFacts } from '@/lib/publish/contract'
import { narrativeText } from '../themes/blocks/narrative'
import { ItinerarySection } from '../themes/blocks/TourFacts'

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
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').replace(/ ([:,.)])/g, '$1')

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
        tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Nile classic', facts: null, narrative: null },
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
      expect(render(archetype, payload({}, archetype), true)).toContain('Aperçu — ce site n’est pas public')
      const draft = payload({ kind: 'tour', title: 'Soon', unpublished: true, tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Soon', facts: null, narrative: null } }, archetype)
      expect(render(archetype, draft)).toContain('Pas encore publié')
    })
    it('an empty site says so instead of showing an empty grid', () => {
      expect(render(archetype, payload({ tours: [] }, archetype))).toContain('Nos voyages seront bientôt présentés ici.')
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

// ---------- step 5: the facts on a tour page ----------

const FACTS: TourFacts = {
  durationDays: 3, durationNights: 2, images: ['https://cdn.test/hero.jpg'],
  days: [
    { day: 1, title: 'Cairo', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Giza Pyramids'] },
    { day: 2, title: null, city: 'Luxor', overnight: true, meals: { breakfast: true, lunch: false, dinner: true }, sights: [] },
    { day: 3, title: 'Home', city: 'Luxor', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
  ],
  mainAttractions: ['Karnak'], highlights: [], inclusions: ['Guide'], exclusions: ['Flights'],
  accommodation: [{ kind: 'hotel', name: 'Nile View', city: 'Cairo' }],
  groupSize: { min: 2, max: 8 }, departureDays: ['mon', 'fri'],
  departures: [{ date: '2026-11-16', endDate: null, status: 'open', seatsLeft: 5 }],
  cancellation: { tiers: [{ daysBefore: 30, chargePercent: 25 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
  price: { status: 'available', currency: 'EUR', tierLabel: 'Deluxe', fromPrice: 735,
    bands: [{ minPax: 2, maxPax: 3, perPerson: 840.2 }, { minPax: 4, maxPax: 8, perPerson: 735 }],
    indicative: [{ currency: 'USD', rate: 1.075, rateDate: '2026-10-25' }] },
  publishable: { ok: true, reasons: [] },
}
const tourPage = (archetype: PagePayload['site']['archetype'], facts: TourFacts | null, narrative: PageNarrative | null = null) => payload({
  kind: 'tour', language: 'en', path: 'tours/nile', title: 'Nile classic', tours: [],
  tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Nile classic', facts, narrative },
  site: { ...payload({}, archetype).site, identity: blank },
}, archetype)

for (const archetype of ARCHETYPES) {
  describe(`${archetype}: tour facts`, () => {
    const html = render(archetype, tourPage(archetype, FACTS))
    const words = text(html)
    it('one price for the chosen group, rounded UP, with its total — never a price by nationality', () => {
      expect(words).toContain('€841') // 840.20 is never shown as €840
      expect(words).not.toContain('€840')
      expect(words).toContain('per person · Deluxe')
      expect(words).toContain('Total €1,682') // the shown €841 × 2 travellers
      expect(words).toContain('Lower per person for larger groups')
      expect(words).toMatch(/≈ \$904 per person · Indicative only \(you pay in EUR/)
      // One price for one configuration: no band table, no second figure.
      expect(words).not.toContain('€735')
      expect(words).not.toMatch(/passport|nationalit|residen/i)
    })
    it('every number on the page comes from the facts', () => {
      const allowed = new Set(['841', '682', '904', '25', '2026', '16', '30', '100', '5', '2', '8', '3', '4', '1'])
      for (const n of words.match(/\d+/g) ?? []) expect(allowed, n).toContain(n)
    })
    it('days, inclusions, where it sleeps, group size, departure days and terms — no "daily", no "free"', () => {
      expect(words).toContain('Day 1')
      expect(words).toContain('Visits: Giza Pyramids')
      expect(words).toContain('Nile View, Cairo')
      expect(words).toContain('2–8 travellers')
      expect(words).toContain('Departs: Monday and Friday')
      expect(words).toContain('30 days or fewer before departure: 25% charged when cancelled')
      expect(words).toContain('On the day of departure: 100% charged when cancelled')
      expect(words.toLowerCase()).not.toMatch(/\bdaily\b|\bfree\b|refund/)
      expect(html).toContain('src="https://cdn.test/hero.jpg"')
    })
    it('the archetype decides the order', () => {
      const order = [...html.matchAll(/data-section="([a-zA-Z]+)"/g)].map(m => m[1])
      expect(order).toEqual(THEMES[archetype].tourSections.filter(sct => order.includes(sct)))
      if (archetype === 'transparent_value') expect(order.indexOf('price')).toBeLessThan(order.indexOf('itinerary'))
      else expect(order.indexOf('itinerary')).toBeLessThan(order.indexOf('price'))
    })
    it('a price on request shows no amount and no currency anywhere', () => {
      const onRequest = { ...FACTS, price: { ...FACTS.price, status: 'on_request' as const, tierLabel: null, fromPrice: null, bands: [], indicative: [] } }
      const w = text(render(archetype, tourPage(archetype, onRequest)))
      expect(w).toContain('Price on request')
      expect(w).not.toMatch(/[€$£]|\bEUR\b|\bUSD\b/)
    })
    it('an absent fact is an absent section', () => {
      const bare = { ...FACTS, cancellation: null, departureDays: [], departures: [], groupSize: null, accommodation: [], images: [] }
      const h = render(archetype, tourPage(archetype, bare))
      for (const sct of ['terms', 'departures', 'groupSize', 'accommodation']) expect(h, sct).not.toMatch(new RegExp(`data-section="${sct}"[^>]*>\\s*<section`))
      expect(text(h)).not.toContain('Cancellation')
      expect(text(h)).not.toContain('Departs')
    })
  })
}

// ---------- step 7: approved narrative, slots filled from the facts ----------

const NARRATIVE: PageNarrative = {
  overview: [{ type: 'text', text: 'Temples by the river, from' }, { type: 'slot', slot: 'price_from' }, { type: 'text', text: '.\n\nA second paragraph, for' }, { type: 'slot', slot: 'group_size' }, { type: 'text', text: '.' }],
  highlights: [[{ type: 'text', text: 'Karnak at dawn' }], [{ type: 'text', text: 'Departing' }, { type: 'slot', slot: 'departure_days' }]],
  days: [{ day: 2, segments: [{ type: 'text', text: 'A quiet morning in Luxor.' }] }],
  seo: { title: 'Nile classic', description: 'Temples by the river.' },
}

for (const archetype of ARCHETYPES) {
  describe(`${archetype}: approved narrative`, () => {
    const words = text(render(archetype, tourPage(archetype, FACTS, NARRATIVE)))
    it('the overview, in paragraphs, with its slots filled from today\'s facts', () => {
      expect(words).toContain('Temples by the river, from €735 per person.') // the tour's "from": its lowest band
      expect(words).toContain('A second paragraph, for 2–8 travellers.')
    })
    it('written highlights replace the records\' list; a day\'s text sits under its day', () => {
      expect(words).toContain('Departing Monday and Friday')
      expect(words).toContain('Karnak at dawn')
      expect(words).toMatch(/Day 2[^]*A quiet morning in Luxor\./)
    })
    it('the overview section comes where the archetype puts it', () => {
      const html = render(archetype, tourPage(archetype, FACTS, NARRATIVE))
      const order = [...html.matchAll(/data-section="([a-zA-Z]+)"/g)].map(m => m[1])
      expect(order.indexOf('overview')).toBeGreaterThan(-1)
      expect(order).toEqual(THEMES[archetype].tourSections.filter(sct => order.includes(sct)))
    })
  })
}

describe('filling slots', () => {
  it('a slot whose fact is gone drops the whole text — never a hole in a sentence', () => {
    const onRequest = { ...FACTS, price: { ...FACTS.price, status: 'on_request' as const, tierLabel: null, fromPrice: null, bands: [], indicative: [] } }
    expect(narrativeText(NARRATIVE.overview, onRequest, 'en')).toBeNull()
  })
  it('the cancellation slot states the tiers as they are', () => {
    expect(narrativeText([{ type: 'text', text: 'Terms:' }, { type: 'slot', slot: 'cancellation' }], FACTS, 'en'))
      .toBe('Terms: 30 days or fewer before departure: 25% charged when cancelled; On the day of departure: 100% charged when cancelled')
  })
  it('a one-day tour is "1 day", never "1 days"', () => {
    const dayTour = { ...FACTS, durationDays: 1, durationNights: 0 }
    expect(narrativeText([{ type: 'slot', slot: 'duration' }], dayTour, 'en')).toBe('1 day')
    expect(narrativeText([{ type: 'slot', slot: 'duration' }], { ...FACTS, durationDays: 2, durationNights: 1 }, 'en')).toBe('2 days / 1 night')
    expect(renderToStaticMarkup(<ItinerarySection facts={dayTour} lang="en" variant="private_journeys" />)).toContain('1 day<')
  })
})
