import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { routeStops } from '../themes/modern/RouteMap'
import { photoFor, tourPhotos } from '../lib/photos'
import { formatPrice } from '../themes/blocks/format'
import type { PagePayload, TourFacts } from '@/lib/publish/contract'

// ============================================================================
// The Modern theme (redesign, operator 2026-10-27): tour cards with their
// facts, the journey finder, destination pages, the route map and photos.
// The rule is the module's: every number shown is the records'.
// ============================================================================

const site: PagePayload['site'] = {
  id: '00000000-0000-4000-8000-0000000000bb', tenantId: '00000000-0000-4000-8000-0000000000aa', archetype: 'modern',
  companyName: 'Nile & Co', languages: ['en', 'fr'], brand: {}, publicHost: null,
  identity: { tagline: 'Egypt, your way', logoUrl: null, phone: null, email: 'hello@nileco.example', whatsapp: null, address: null, licenseNumber: null },
}
const card = (days: number, cities: string[], amount: number | null) =>
  ({ days, nights: Math.max(0, days - 1), cities, from: amount === null ? null : { amount, currency: 'EUR' }, image: null })
const tours: PagePayload['tours'] = [
  { title: 'Giza Pyramids and the Sphinx', path: 'tours/giza', card: card(1, ['Giza'], 99.2) },
  { title: 'Classic Nile cruise', path: 'tours/nile', card: card(4, ['Luxor', 'Aswan'], 840.4) },
  { title: 'Cairo and the museum', path: 'tours/cairo', card: card(3, ['Cairo'], null) },
  { title: 'White Desert', path: 'tours/desert', card: card(5, ['Bahariya', 'White Desert'], null) },
]
const home = (over: Partial<PagePayload> = {}): PagePayload => ({
  kind: 'home', language: 'en', path: '', title: 'Nile & Co', site, alternates: [], tour: null, tours,
  destinations: [{ name: 'Cairo', path: 'destinations/cairo', count: 2 }, { name: 'Luxor', path: 'destinations/luxor', count: 1 }],
  unpublished: false, pageId: null, ...over,
})
const render = (page: PagePayload) => {
  const theme = THEMES.modern
  return renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\r\n]+/g, ' ')

describe('home: the journey finder and destinations', () => {
  const html = render(home())
  it('every tour is a card with its own length, cities and "from" — all there without script', () => {
    const w = text(html)
    for (const x of tours) expect(html).toContain(`href="/en/${x.path}"`)
    expect(w).toContain('1 day · Giza')
    expect(w).toContain('4 days · 3 nights · Luxor, Aswan')
    expect(w).toContain(`From ${formatPrice(99.2, 'EUR', 'en')}`) // 99.20 is shown rounded up, like the tour page
    expect(w).toContain(`From ${formatPrice(840.4, 'EUR', 'en')}`)
  })
  it('a tour with its price on request shows no amount on its card', () => {
    const cairoCard = html.slice(html.indexOf('href="/en/tours/cairo"'), html.indexOf('href="/en/tours/desert"'))
    expect(cairoCard).not.toContain(formatPrice(1, 'EUR', 'en').replace(/[\d.,\s]/g, '')) // no currency sign at all
  })
  it('the tours listing offers only the lengths the tours have, and the places they go', () => {
    const html = render(home({ kind: 'listing', path: 'tours' }))
    const w = text(html)
    expect(w).toContain('Day trips')
    expect(w).toContain('Up to 4 days')
    expect(w).toContain('5 days or more')
    expect(html).toContain('<option value="Luxor">Luxor</option>')
  })
  it('lists the destinations, each with how many journeys go there', () => {
    expect(html).toContain('href="/en/destinations/cairo"')
    expect(text(html)).toContain('Cairo 2 journeys')
    expect(text(html)).toContain('Luxor 1 journey')
  })
  it('the brand colour is the agency\'s — the theme names no colour of its own', () => {
    expect(html).not.toMatch(/#b08d57|#7a5c3e|gold|beige/i)
  })
})

describe('a destination page', () => {
  it('names the place and lists only the journeys that go there, without filters', () => {
    const html = render(home({ kind: 'destination', path: 'destinations/luxor', title: 'Luxor', destination: { name: 'Luxor', slug: 'luxor' }, tours: [tours[1]] }))
    const w = text(html)
    expect(w).toContain('Destination Luxor')
    expect(w).toContain('Journeys that go there')
    expect(html).toContain('href="/en/tours/nile"')
    expect(html).not.toContain('href="/en/tours/giza"')
    expect(html).not.toContain('role="search"')
    expect(html).not.toContain('href="/en/destinations/luxor"') // not a tile to itself
  })
})

describe('the route and the photos', () => {
  const facts = {
    days: [
      { day: 1, title: null, city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: false, dinner: false }, sights: [] },
      { day: 2, title: null, city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: false, dinner: false }, sights: [] },
      { day: 3, title: null, city: 'Atlantis', overnight: true, meals: { breakfast: false, lunch: false, dinner: false }, sights: [] },
      { day: 4, title: null, city: 'Aswan', overnight: false, meals: { breakfast: false, lunch: false, dinner: false }, sights: [] },
    ],
  } as unknown as TourFacts
  it('the route is the days\' cities in order, each stop once in a row, unknown places left out', () => {
    expect(routeStops(facts).map(s => s.name)).toEqual(['Luxor', 'Aswan'])
  })
  afterEach(() => { vi.unstubAllEnvs() })
  it('local preview (library on): the agency\'s own photo first, then the library\'s, never none', () => {
    vi.stubEnv('PUBLISH_PHOTO_LIBRARY', 'commons')
    expect(tourPhotos({ name: 'Giza day', images: ['https://cdn.example/own.jpg'] })[0].src).toBe('https://cdn.example/own.jpg')
    expect(photoFor('Valley of the Kings')?.alt).toBe('The Valley of the Kings')
    expect(tourPhotos({ name: 'Somewhere unknown' })).toHaveLength(1)
  })
  it('a live site (library off): only the agency\'s own photos — no unlicensed picture ever', () => {
    vi.stubEnv('PUBLISH_PHOTO_LIBRARY', '')
    expect(photoFor('Valley of the Kings')).toBeNull()
    expect(tourPhotos({ name: 'Giza day', sights: ['Giza Pyramids'] })).toEqual([])
    expect(tourPhotos({ name: 'Giza day', images: ['https://cdn.example/own.jpg'] }).map(p => p.src)).toEqual(['https://cdn.example/own.jpg'])
  })
  it('a live site draws colour panels where there is no photo, and loads nothing from Wikimedia', () => {
    vi.stubEnv('PUBLISH_PHOTO_LIBRARY', '')
    const html = render(home())
    expect(html).not.toContain('wikimedia')
    expect(html).not.toContain('<img')
    expect(html.match(/class="[^"]*panel/g)?.length).toBeGreaterThanOrEqual(tours.length)
  })
})

describe('matching the agency\'s own website', () => {
  it('every theme links back to the agency\'s main website when it has one (https only)', () => {
    for (const archetype of ['modern', 'private_journeys', 'transparent_value'] as const) {
      const page = home({ site: { ...site, archetype, brand: { website: 'https://www.sunrise-travel.example' } } })
      const theme = THEMES[archetype]
      const html = renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
      expect(html, archetype).toContain('href="https://www.sunrise-travel.example/"')
      expect(text(html), archetype).toContain('← sunrise-travel.example')
    }
    const plain = render(home({ site: { ...site, brand: { website: 'http://insecure.example' } } }))
    expect(plain).not.toContain('insecure.example')
  })
})

describe('the agency\'s Google reviews on the page', () => {
  const reviews: NonNullable<PagePayload['reviews']> = {
    name: 'Sunrise Travel', rating: 4.8, count: 213, url: 'https://maps.google.com/p',
    reviews: [
      { author: 'Lena F.', authorUrl: 'https://maps.google.com/u/1', authorPhoto: null, rating: 5, text: 'Wonderful guide.', translated: false, original: null, when: '2 weeks ago', url: 'https://maps.google.com/r/1' },
      { author: 'Jean P.', authorUrl: null, authorPhoto: null, rating: 4, text: 'Very good.', translated: true, original: 'Très bien.', when: 'a month ago', url: 'https://maps.google.com/r/2' },
    ],
  }
  it('every theme shows them credited, linked to Google Maps, translations marked, and says Google does not verify them', () => {
    for (const archetype of ['modern', 'private_journeys', 'transparent_value'] as const) {
      const page = home({ site: { ...site, archetype }, reviews })
      const theme = THEMES[archetype]
      const html = renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
      const w = text(html)
      expect(w, archetype).toContain('What travellers say')
      expect(w, archetype).toContain('4.8')
      expect(w, archetype).toContain('213 reviews on Google')
      expect(html, archetype).toContain('href="https://maps.google.com/u/1"')
      expect(html, archetype).toContain('href="https://maps.google.com/r/1"')
      expect(w, archetype).toContain('Translated by Google')
      expect(w, archetype).toContain('Reviews are not verified by Google.')
      expect(html, archetype).toContain('>Google Maps</a>')
    }
  })
  it('no reviews, no section — nothing is ever invented', () => {
    expect(text(render(home()))).not.toContain('What travellers say')
  })
})

// ============================================================================
// The website template (operator brief 2026-10-28): the tour page's order and
// sections, the booking card, the one-step form, the footer, home, listing,
// about and contact. Still the module's rule: a fact not given is not shown.
// ============================================================================

describe('the website template', () => {
  const dayTour: TourFacts = {
    durationDays: 1, durationNights: 0, images: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg', 'https://cdn.example/3.jpg', 'https://cdn.example/4.jpg', 'https://cdn.example/5.jpg', 'https://cdn.example/6.jpg'],
    days: [{ day: 1, title: 'Giza', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Giza Pyramids', 'Great Sphinx'],
      stops: [{ time: '08:00', name: 'Hotel pickup' }, { time: '09:00', name: 'Giza Pyramids' }, { time: null, name: 'Great Sphinx' }] }],
    mainAttractions: ['Giza Pyramids'], highlights: ['The Great Pyramid up close'], inclusions: ['Egyptologist guide'], exclusions: ['Tips'], accommodation: [],
    groupSize: { min: 2, max: 8 }, departureDays: [], departures: [],
    cancellation: { tiers: [{ daysBefore: 45, chargePercent: 10 }, { daysBefore: 30, chargePercent: 25 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    price: { status: 'available', currency: 'EUR', tierLabel: 'Standard', fromPrice: 58, bands: [{ minPax: 2, maxPax: 2, perPerson: 104.88 }, { minPax: 3, maxPax: 8, perPerson: 58 }], indicative: [] },
    publishable: { ok: true, reasons: [] },
    durationHours: 7, tourType: 'Day tour', guideLanguages: ['English', 'French'],
    pickup: { included: true, area: 'Cairo', meetingPoint: 'Hotel lobby' },
    faq: [{ question: 'Is lunch included?', answer: 'Yes, at a local restaurant.' }],
  }
  const fullSite: PagePayload['site'] = { ...site, identity: { ...site.identity, whatsapp: '+20 100 000 0000', address: '1 Nile St, Cairo', licenseNumber: 'ETAA 1234',
    legalEntity: 'Nile & Co Travel S.A.E.', termsUrl: 'https://nileco.example/terms', privacyUrl: 'https://nileco.example/privacy' } }
  const tourPage = (facts: TourFacts, over: Partial<PagePayload> = {}): PagePayload => ({
    ...home(), kind: 'tour', path: 'tours/giza', title: 'Giza', site: fullSite, tours: [], pageId: '00000000-0000-4000-8000-0000000000dd',
    tour: { templateId: '00000000-0000-4000-8000-0000000000cc', name: 'Giza Pyramids and the Sphinx', facts, narrative: null },
    related: tours.slice(1), ...over,
  })
  const html = render(tourPage(dayTour))
  const w = text(html)

  it('tour page: breadcrumb → title → gallery → key facts, and no photo hero with words laid over it', () => {
    const at = (needle: string) => html.indexOf(needle)
    expect(at('aria-label="Breadcrumb"')).toBeGreaterThan(-1)
    expect(at('aria-label="Breadcrumb"')).toBeLessThan(at('<h1'))
    expect(at('<h1')).toBeLessThan(at('src="https://cdn.example/1.jpg"'))
    expect(at('src="https://cdn.example/1.jpg"')).toBeLessThan(at('data-section="groupSize"'))
    expect(html).not.toMatch(/tourHero|HeroShade/)
    expect(w).toContain('View all 6 photos')
  })
  it('key facts: hours for a day tour, the type, pickup, guide languages and the free-cancellation line', () => {
    expect(w).toContain('Duration 7 hours')
    expect(w).toContain('Tour type Day tour')
    expect(w).toContain('Pickup Hotel pickup in Cairo')
    expect(w).toContain('Guide English, French')
    expect(w).toContain('Cancellation Free cancellation up to 46 days before')
  })
  it('a day tour is one open timeline with its approximate times — no map, no days to open', () => {
    const itinerary = html.slice(html.indexOf('data-section="itinerary"'), html.indexOf('data-section="inclusions"'))
    expect(itinerary).not.toContain('<details')
    expect(itinerary).not.toContain('<svg')
    expect(text(itinerary)).toContain('≈ 08:00 Hotel pickup ≈ 09:00 Giza Pyramids Great Sphinx')
    expect(text(itinerary)).toContain('Times are approximate.')
  })
  it('a tour to more than one place keeps its map; days still open one by one', () => {
    const multi = render(tourPage({ ...dayTour, durationDays: 2, durationNights: 1, days: [
      { ...dayTour.days[0], day: 1, city: 'Luxor', stops: undefined }, { ...dayTour.days[0], day: 2, city: 'Aswan', stops: undefined }] }))
    const itinerary = multi.slice(multi.indexOf('data-section="itinerary"'), multi.indexOf('data-section="inclusions"'))
    expect(itinerary).toContain('<svg')
    expect(itinerary).toContain('<details')
  })
  it('cancellation: one row of cells, the free window first', () => {
    expect(w).toContain('46+ days Free 31–45 days 10% 1–30 days 25% On the day 100%')
  })
  it('pickup and meeting point, FAQ, related tours; reviews only when there are some', () => {
    expect(w).toContain('Pickup and meeting point')
    expect(w).toContain('Meeting point Hotel lobby')
    expect(html).toMatch(/<details><summary>Is lunch included\?<\/summary>/)
    expect(w).toContain('You may also like')
    for (const x of tours.slice(1)) expect(html).toContain(`href="/en/${x.path}"`)
    expect(w).not.toContain('What travellers say')
  })
  it('highlights are a simple list with an icon, not cards', () => {
    const block = html.slice(html.indexOf('data-section="highlights"'), html.indexOf('data-section="itinerary"'))
    expect(block).toContain('<svg')
    expect(text(block)).toContain('The Great Pyramid up close')
  })
  it('the booking card: price and total, the option explained, a date, WhatsApp, and only true promises', () => {
    const card = html.slice(html.indexOf('data-section="price"'))
    const c = text(card)
    expect(c).toContain(`${formatPrice(104.88, 'EUR', 'en')} per person`)
    expect(c).toContain('Option: Standard. The price includes everything listed under “What is included”.')
    expect(card).toContain('type="date"')
    expect(c).toContain('Ask on WhatsApp')
    expect(c).toContain('Free cancellation up to 46 days before')
    expect(c).toContain('No payment to enquire')
    expect(c).toContain('Licensed tour operator · ETAA 1234')
  })
  it('no free window, no licence: those promises are not made', () => {
    const strict = render(tourPage({ ...dayTour, cancellation: { tiers: [{ daysBefore: 400, chargePercent: 100 }], wording: null } }, { site: { ...fullSite, identity: { ...fullSite.identity, licenseNumber: null } } }))
    const card = text(strict.slice(strict.indexOf('data-section="price"')))
    expect(card).not.toContain('Licensed')
    expect(card).toContain('No payment to enquire')
  })
  it('the enquiry form is one step, with a real date field the booking card fills', () => {
    const form = html.slice(html.indexOf('id="enquire"'))
    expect(form).toContain('id="enq-travellers"')
    const date = form.match(/<input[^>]*id="enq-date"[^>]*>/)?.[0] ?? ''
    expect(date).toContain('type="date"')
    expect(date).toContain('name="travel_date"')
    expect(form).not.toContain('type="month"')
    expect(text(form)).not.toMatch(/Step \d/)
  })
  it('sections are not separated by stacked rules', () => {
    expect(html).not.toContain('<hr')
  })
  it('the language switcher is a menu (globe and code), with real links to the other languages', () => {
    expect(html).toMatch(/<details[^>]*><summary aria-label="Languages">/)
    expect(w).toContain('EN')
    expect(html).toContain('hrefLang="fr"')
  })
  it('the footer says who the visitor deals with', () => {
    const foot = text(html.slice(html.indexOf('<footer')))
    for (const x of ['Nile & Co Travel S.A.E.', 'Licence ETAA 1234', '1 Nile St, Cairo', 'WhatsApp +20 100 000 0000', 'Booking terms', 'Privacy', 'Cookie settings', 'Website by Autoura'])
      expect(foot.replace(/&amp;/g, '&')).toContain(x)
    expect(html).toContain('href="https://nileco.example/terms"')
  })
  it('the FAQ is also stated for search engines, word for word', async () => {
    const { structuredData } = await import('../lib/seo')
    const faq = structuredData(tourPage(dayTour)).find(b => b['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
    expect(faq.mainEntity).toEqual([{ '@type': 'Question', name: 'Is lunch included?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, at a local restaurant.' } }])
    expect(structuredData(tourPage({ ...dayTour, faq: [] })).some(b => b['@type'] === 'FAQPage')).toBe(false)
  })

  it('home: headline, value line, two buttons, no decorative strips; why us, how booking works, a call to action', () => {
    const h = render(home({ site: fullSite, tours: tours.map((x, i) => ({ ...x, card: { ...x.card!, type: i % 2 ? 'Day tour' : 'Nile cruise' } })) }))
    const hw = text(h)
    expect(hw).toContain('Egypt, your way')
    expect(hw).toContain('Tours in Giza, Luxor, Aswan and Cairo — one clear price per person for your group.')
    expect(hw).toContain('Browse tours')
    expect(h).toMatch(/href="\/api\/wa\?[^"]*" rel="nofollow">WhatsApp</)
    expect(h).not.toMatch(/strip/i)
    expect(hw).toContain('Why travel with us')
    expect(hw).toContain('How booking works')
    expect(hw).toContain('Ready to plan your trip?')
    // the type chips: every type the tours have, and "All"
    expect(hw).toContain('All Day tour Nile cruise')
  })
  it('listing: sort, and pages of nine', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `Tour ${String.fromCharCode(65 + i)}`, path: `tours/t${i}`, card: card(1, ['Giza'], null) }))
    const l = render(home({ kind: 'listing', path: 'tours', tours: many }))
    expect(l).toContain('<option value="priceAsc">Price: lowest first</option>')
    expect((l.match(/class="[^"]*_card_/g) ?? []).length).toBe(9)
    expect(text(l)).toContain('Previous 1 2 Next')
  })
  it('about: who the company is, from its records', () => {
    const a = text(render(home({ kind: 'about', path: 'about', site: fullSite })))
    expect(a).toContain('About us')
    expect(a).toContain('Licences and registration')
    expect(a.replace(/&amp;/g, '&')).toContain('Registered company Nile & Co Travel S.A.E.')
    expect(a).toContain('Licence number ETAA 1234')
  })
  it('contact: the ways to reach them, the form, and a confirmation shown in its place once sent', () => {
    const c = render(home({ kind: 'contact', path: 'contact', site: fullSite }))
    expect(text(c)).toContain('Contact us')
    expect(c).toContain('id="enquire"')
    expect(c).toContain('Thank you — we have your enquiry')
    expect(c).toContain('id="enquiry-sent"')
  })
})
