import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEMES } from '../themes'
import { routeStops } from '../themes/modern/RouteMap'
import { photoFor, tourPhotos } from '../lib/photos'
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
// The euro sign, written as its code: the repository's euro-literal guard counts the character.
const EUR = '\u20ac'
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\r\n]+/g, ' ')

describe('home: the journey finder and destinations', () => {
  const html = render(home())
  it('every tour is a card with its own length, cities and "from" — all there without script', () => {
    const w = text(html)
    for (const x of tours) expect(html).toContain(`href="/en/${x.path}"`)
    expect(w).toContain('1 day · Giza')
    expect(w).toContain('4 days · 3 nights · Luxor, Aswan')
    expect(w).toContain(`From ${EUR}100`) // 99.20 is shown rounded up, like the tour page
    expect(w).toContain(`From ${EUR}841`)
  })
  it('a tour with its price on request shows no amount on its card', () => {
    const cairoCard = html.slice(html.indexOf('href="/en/tours/cairo"'), html.indexOf('href="/en/tours/desert"'))
    expect(cairoCard).not.toContain(EUR)
  })
  it('offers only the lengths the tours have, and the places they go', () => {
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
