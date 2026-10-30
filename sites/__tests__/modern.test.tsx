import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { routeStops } from '../themes/modern/RouteMap'
import { defaultPicture, photoFor, tourPhotos, tourPicture } from '../lib/photos'
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
  it('the Tours page of four to six: type chips, the count and a sort — no filters, no destinations', () => {
    const l = render(home({ kind: 'listing', path: 'tours', tours: tours.map((x, i) => ({ ...x, card: { ...x.card!, type: i % 2 ? 'Day tour' : 'Nile cruise' } })) }))
    const w = text(l)
    expect(w).toContain('All Day tour Nile cruise')
    expect(w).toContain('4 tours')
    expect(l).toContain('<option value="priceAsc">Price: lowest first</option>')
    expect(l).not.toContain('type="checkbox"')
    expect(l).not.toContain('href="/en/destinations/')
  })
  it('lists the destinations, each with how many tours go there — when there are two or more', () => {
    expect(html).toContain('href="/en/destinations/cairo"')
    expect(text(html)).toContain('Cairo 2 tours')
    expect(text(html)).toContain('Luxor 1 tour')
    const one = render(home({ destinations: [{ name: 'Cairo', path: 'destinations/cairo', count: 4 }] }))
    expect(one).not.toContain('href="/en/destinations/cairo"')
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
  it('a live site never shows an empty box: each tour draws its first site, and nothing loads from Wikimedia', () => {
    vi.stubEnv('PUBLISH_PHOTO_LIBRARY', '')
    const html = render(home())
    expect(html).not.toContain('wikimedia')
    expect(html).not.toContain('<img')
    expect(html).not.toMatch(/class="[^"]*panel/)
    // the hero, every card and every destination tile
    expect(html.match(/<svg[^>]*class="[^"]*_art_/g)?.length).toBeGreaterThanOrEqual(1 + tours.length + 2)
  })
  it('the default picture is the first itinerary site\'s, then the destination\'s', () => {
    vi.stubEnv('PUBLISH_PHOTO_LIBRARY', '')
    expect(tourPicture({ name: 'A day out', places: ['Step Pyramid of Djoser', 'Giza Pyramids'], cities: ['Cairo'] })).toMatchObject({ kind: 'art', art: 'step-pyramid' })
    expect(tourPicture({ name: 'A day out', places: ['Somewhere new'], cities: ['Luxor'] })).toMatchObject({ kind: 'art', art: 'karnak' })
    expect(tourPicture({ name: 'Mine', image: 'https://cdn.example/own.jpg', places: ['Giza Pyramids'] })).toEqual({ kind: 'photo', src: 'https://cdn.example/own.jpg', alt: 'Mine' })
    expect(defaultPicture(['Nowhere known'])).toMatchObject({ kind: 'art' })
  })
})

describe('matching the agency\'s own website', () => {
  it('every theme links back to the agency\'s main website when it has one (https only)', () => {
    for (const archetype of ['modern', 'private_journeys', 'transparent_value'] as const) {
      const page = home({ site: { ...site, archetype, brand: { website: 'https://www.sunrise-travel.example' } } })
      const theme = THEMES[archetype]
      const html = renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
      expect(html, archetype).toContain('href="https://www.sunrise-travel.example/"')
      expect(text(html), archetype).toContain('sunrise-travel.example')
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
    expect(w).toContain('Guide speaks English, French')
    expect(w).toContain('Cancellation Free cancellation up to 46 days before')
  })
  it('a day tour is one open timeline with its approximate times — no map, no days to open', () => {
    const itinerary = html.slice(html.indexOf('data-section="itinerary"'), html.indexOf('data-section="inclusions"'))
    expect(itinerary).not.toContain('<details')
    expect(itinerary).not.toContain('<svg')
    expect(text(itinerary)).toContain('08:00 Hotel pickup 09:00 Giza Pyramids Great Sphinx')
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
    expect(w).toContain('46+ days before Free 45 to 31 days 10% charged 30 to 1 days 25% charged Day of the tour 100% charged')
  })
  it('pickup and meeting point, FAQ, related tours; reviews only when there are some', () => {
    expect(w).toContain('Pickup and meeting point')
    expect(w).toContain('Meeting point Hotel lobby')
    expect(html).toMatch(/<details><summary>Is lunch included\?<\/summary>/)
    expect(w).toContain('Pair it with')
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
    expect(c).toContain('Licensed by ETAA · No. ETAA 1234')
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
  it('the tour page polish (boards 01/02): by-line, "Your day", questions, the boxed form with name first, the sidebar\'s lines', () => {
    expect(w).toContain('Private tour by Nile & Co'.replace('&', '&amp;'))
    expect(text(html.slice(html.indexOf('data-section="itinerary"')))).toMatch(/^[^<]*Your day/)
    expect(w).toContain('Questions Is lunch included?')
    expect(w).toContain('Ask us about this tour No payment needed to ask.')
    const form = html.slice(html.indexOf('id="enquire"'))
    expect(form.indexOf('name="name"')).toBeLessThan(form.indexOf('id="enq-date"'))
    expect(form.indexOf('id="enq-date"')).toBeLessThan(form.indexOf('id="enq-travellers"'))
    const card = text(html.slice(html.indexOf('data-section="price"')))
    expect(card).toContain('Check availability')
    expect(card).toContain('Price for 2 travellers · lower for larger groups')
    expect(html).toMatch(/_mobileBar_/)
    expect(w).toContain('Hotel pickup From your hotel in Cairo.')
    expect(w).toContain('Meeting point Hotel lobby')
    const withDays = text(render(tourPage({ ...dayTour, departureDays: ['mon', 'wed', 'fri'] })))
    expect(withDays).toContain('Runs Mon, Wed and Fri')
    const noDayOf = text(render(tourPage({ ...dayTour, cancellation: { tiers: [{ daysBefore: 30, chargePercent: 25 }, { daysBefore: 7, chargePercent: 50 }], wording: null } })))
    expect(noDayOf).toContain('31+ days before Free 30 to 8 days 25% charged 7 days or fewer 50% charged')
    const shared = text(render(tourPage({ ...dayTour, departures: [{ date: '2026-12-01', endDate: null, status: 'open', seatsLeft: 4 }] })))
    expect(shared).toContain('Tour by Nile')
    expect(shared).not.toContain('Private tour by')
  })
  it('the footer says who the visitor deals with', () => {
    const foot = text(html.slice(html.indexOf('<footer')))
    for (const x of ['Nile & Co Travel S.A.E.', 'ETAA licence No. ETAA 1234', '1 Nile St, Cairo', 'WhatsApp +20 100 000 0000', 'Legal Booking terms', 'Privacy policy', 'Cookie settings', 'Website by Autoura'])
      expect(foot.replace(/&amp;/g, '&')).toContain(x)
    expect(html).toContain('href="https://nileco.example/terms"')
  })
  it('the FAQ is also stated for search engines, word for word', async () => {
    const { structuredData } = await import('../lib/seo')
    const faq = structuredData(tourPage(dayTour)).find(b => b['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
    expect(faq.mainEntity).toEqual([{ '@type': 'Question', name: 'Is lunch included?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, at a local restaurant.' } }])
    expect(structuredData(tourPage({ ...dayTour, faq: [] })).some(b => b['@type'] === 'FAQPage')).toBe(false)
  })

  it('home: the fallback headline, two buttons, the trust strip, why us (an icon and a line each) and the custom-trip band', () => {
    const h = render(home({ site: { ...fullSite, identity: { ...fullSite.identity, foundedYear: 2010 } },
      tours: tours.map((x, i) => ({ ...x, card: { ...x.card!, guideLanguages: i ? ['English'] : ['English', 'French'] } })) }))
    const hw = text(h)
    expect(hw).toContain('Licensed tour operator in Egypt')
    expect(hw).toContain('Private tours across Egypt with Egyptologist guides')
    expect(hw).toContain('One clear price per person — the price you pay.')
    expect(hw).toContain('Browse tours')
    expect(h).toMatch(/href="\/api\/wa\?[^"]*" rel="nofollow">.*WhatsApp us</)
    expect(hw).toContain('Licensed by ETAA No. ETAA 1234')
    expect(hw).toContain('Operating since 2010')
    expect(hw).toContain('Guides speak English, French')
    expect(hw).not.toMatch(/reviews|★/) // no review score without real reviews
    expect(hw).toContain('Why travel with us')
    const why = h.slice(h.indexOf('data-section="why"'), h.indexOf('data-section="destinations"'))
    expect(why.match(/<li>/g)?.length).toBe(why.match(/<svg/g)?.length)
    expect(why.match(/<li>/g)?.length).toBe(why.match(/_whyText_/g)?.length)
    expect(hw).toContain('Don’t see what you need? We build private trips around your dates. Plan your journey')
    expect(hw).toContain('All 4 tours')
    expect(hw).not.toContain('How booking works') // a large catalogue's
  })
  it('home with one place: the headline names it; the agency\'s own headline wins, and the place moves to the subline', () => {
    const one = { destinations: [{ name: 'Cairo', path: 'destinations/cairo', count: 1 }], tours: [tours[0]] }
    const hw = text(render(home({ ...one, site: fullSite })))
    expect(hw).toContain('Private tours in Cairo with Egyptologist guides')
    expect(hw).toContain('See the tour')
    expect(hw).toContain('Our tour')
    expect(hw).not.toContain('Destinations')
    const own = text(render(home({ ...one, site: { ...fullSite, identity: { ...fullSite.identity, headline: 'Egypt, slowly' } } })))
    expect(own).toContain('Egypt, slowly')
    expect(own).toContain('Private tours in Cairo. One clear price per person')
  })
  it('one tour is one featured card; two or three are large cards', () => {
    const one = render(home({ kind: 'listing', path: 'tours', tours: [{ ...tours[0], card: { ...tours[0].card!, highlights: ['The Great Pyramid', 'The Sphinx'] } }] }))
    expect(one).toMatch(/<article class="[^"]*_featured_/)
    expect(text(one)).toContain('The Great Pyramid The Sphinx')
    expect(text(one)).toContain('View tour')
    expect(one).not.toContain('<select')
    const two = render(home({ kind: 'listing', path: 'tours', tours: tours.slice(0, 2) }))
    expect(two).toMatch(/<ul class="[^"]*_cardsLarge_[^"]*" data-n="2"/)
    expect(text(two)).toContain('Don’t see what you need?')
  })
  it('home: the type chips and how booking works belong to a large catalogue', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `Tour ${i}`, path: `tours/t${i}`, card: { ...card(1, ['Giza'], null), type: i % 2 ? 'Day tour' : 'Nile cruise' } }))
    const hw = text(render(home({ tours: many })))
    expect(hw).toContain('All Day tour Nile cruise')
    expect(hw).toContain('How booking works')
    expect(hw).toContain('All 8 tours')
  })
  it('listing of seven or more: filters by type, place and length, a sort, and pages of nine', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `Tour ${String.fromCharCode(65 + i)}`, path: `tours/t${i}`,
      card: { ...card(i < 6 ? 1 : 3, i % 3 ? ['Giza'] : ['Luxor'], null), type: i % 2 ? 'Day tour' : 'Multi-day' } }))
    const l = render(home({ kind: 'listing', path: 'tours', tours: many }))
    const w = text(l)
    expect(l).toContain('<option value="priceAsc">Price: lowest first</option>')
    expect((l.match(/class="[^"]*_card_/g) ?? []).length).toBe(9)
    expect(w).toContain('Previous 1 2 Next')
    expect(w).toContain('11 tours')
    expect(w).toContain('Tour type All tours 11 Day tour 5 Multi-day 6')
    expect(w).toContain('Destination Giza Luxor')
    expect(w).toContain('Duration Full day 2 to 5 days')
    expect(w).not.toContain('Price per person') // no tour has a price to bound
    const priced = render(home({ kind: 'listing', path: 'tours', tours: many.map((x, i) => ({ ...x, card: { ...x.card, from: { amount: 50 + i * 10, currency: 'EUR' } } })) }))
    expect(text(priced)).toContain('Price per person Min € Max €')
  })
  it('about (board 11): headline, the agency\'s words, stats from the records, the people, the promises, the licences', () => {
    const plain = text(render(home({ kind: 'about', path: 'about', site: fullSite })))
    expect(plain).toContain('About us')
    expect(plain.replace(/&amp;/g, '&')).toContain('Licences and memberships Nile & Co Travel S.A.E. · ETAA licence No. ETAA 1234 · 1 Nile St, Cairo')
    expect(plain).toContain('What we promise One clear price')
    expect(plain).toContain('Our own team')
    expect(plain).toContain('Reachable on the day')
    expect(plain).not.toContain('The people who will guide you') // no people saved, no section
    expect(plain).not.toContain('Year founded') // no stat without its number
    const page = home({ kind: 'about', path: 'about', site: { ...fullSite, identity: { ...fullSite.identity, foundedYear: 2008 } },
      about: 'A family business.\n\nSince 2003.',
      aboutPage: { headline: 'A Cairo team since 2008.', teamPhoto: 'https://cdn.example/team.jpg', people: [
        { name: 'Mona Adel', role: 'Egyptologist', kind: 'guide', languages: ['en', 'es'], photo: 'https://cdn.example/mona.jpg' },
        { name: 'Omar Nabil', role: 'Trip planner', kind: 'staff', languages: ['en', 'fr'], photo: null },
      ] } })
    const html = render(page)
    const a = text(html)
    expect(a).toContain('About us A Cairo team since 2008.')
    expect(html).toContain('A family business.</p><p>Since 2003.</p>')
    expect(html).toContain('src="https://cdn.example/team.jpg"')
    expect(a).toContain('2008 Year founded 1 Licensed Egyptologists 3 Guest languages')
    expect(a).toContain('The people who will guide you')
    expect(a).toContain('Mona Adel Egyptologist · English, Spanish')
    expect(a).toContain('ON Omar Nabil Trip planner · English, French') // no photo: initials
  })
  it('every page\'s footer links to About and Contact', () => {
    expect(html).toContain('href="/en/about"')
    expect(html).toContain('href="/en/contact"')
  })
  it('contact: the ways to reach them, the form, and a confirmation shown in its place once sent', () => {
    const c = render(home({ kind: 'contact', path: 'contact', interests: ['Cairo', 'Luxor'],
      site: { ...fullSite, identity: { ...fullSite.identity, hours: { opens: '09:00', closes: '21:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } } } }))
    const w = text(c)
    expect(w).toContain('Plan your journey')
    for (const name of ['name', 'email', 'whatsapp', 'country', 'travel_date', 'nights', 'adults', 'children', 'message']) expect(c).toContain(`name="${name}"`)
    expect(c).toMatch(/<input type="checkbox" name="interests" value="Luxor"\/>/)
    expect(c.match(/<input[^>]*name="consent"[^>]*>/)?.[0]).toContain('required=""')
    expect(c).toContain('<option value="Spain">Spain</option>')
    expect(w).toContain('Prefer to talk?')
    expect(w).toContain('Hours 09:00 to 21:00 Cairo time, every day')
    expect(w).toContain('Office 1 Nile St, Cairo')
    expect(c).toContain('id="enquire"')
    expect(c).toContain('Thank you — we have your enquiry')
    expect(c).toContain('id="enquiry-sent"')
  })
})
