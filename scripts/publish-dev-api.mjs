#!/usr/bin/env node
/**
 * A stand-in for the GetAutoura app's two internal Publish endpoints, for
 * working on the site renderer (sites/) without a database.
 *
 *   node scripts/publish-dev-api.mjs            # listens on :4010
 *   PUBLISH_APP_URL=http://127.0.0.1:4010 PUBLISH_INTERNAL_SECRET=dev-internal npm run sites:dev
 *   open http://sillage.localhost:3001          (browsers resolve *.localhost)
 *
 * Hostnames it knows:
 *   sillage.localhost       Private journeys, English + French, archetype defaults
 *   afford.localhost        Transparent value, English + Spanish, its own brand
 *   www.sillage.localhost   an alias that 301s to sillage.example
 *   modern.localhost        Modern (redesign mock-up), English + French, default teal palette
 *   navy.localhost          the same tours, Modern, an agency's navy + coral palette
 *   mono.localhost          the same tours, Modern, charcoal + lime and the Clean fonts
 *   anything else           no site
 *
 * The fixture is shaped by lib/publish/contract.ts — keep it in step.
 * Its companies, numbers and tours are invented for development.
 */

import http from 'node:http'

const PORT = Number(process.env.PORT || 4010)
const SECRET = process.env.PUBLISH_INTERNAL_SECRET || 'dev-internal'

const SITES = {
  'sillage.localhost': {
    id: '00000000-0000-4000-8000-00000000d002', tenantId: '00000000-0000-4000-8000-00000000d001',
    archetype: 'private_journeys', status: 'draft', languages: ['en', 'fr'],
    companyName: 'Sillage Egypte (dev)', brand: {},
    identity: { tagline: 'Private journeys along the Nile, shaped around you', logoUrl: null, phone: '+20 2 0000 0000',
      email: 'hello@sillage.invalid', whatsapp: '+20 100 000 0000', address: 'Zamalek, Cairo', licenseNumber: 'ETAA 0000 (dev)' },
    tours: [
      { slug: 'nile-classic', other: 'croisiere-classique', name: 'Classic Nile journey', published: true, price: 'available' },
      { slug: 'cairo-in-depth', other: 'le-caire-en-profondeur', name: 'Cairo in depth', published: false, price: 'on_request' },
      { slug: 'desert-and-oases', other: 'desert-et-oasis', name: 'White Desert and the oases', published: true },
    ],
  },
  'afford.localhost': {
    id: '00000000-0000-4000-8000-00000000e002', tenantId: '00000000-0000-4000-8000-00000000e001',
    archetype: 'transparent_value', status: 'draft', languages: ['en', 'es'],
    companyName: 'AffordEgypt (dev)',
    brand: { palette: { primary: '#1d4ed8', accent: '#facc15', ink: '#0f172a', surface: '#ffffff' }, fontPair: 'friendly', tone: 'warm' },
    identity: { tagline: 'Day tours and short breaks, priced up front', logoUrl: null, phone: null,
      email: 'tours@afford.invalid', whatsapp: '+20 111 111 1111', address: null, licenseNumber: null },
    tours: [
      { slug: 'pyramids-day-tour', other: 'tour-piramides', name: 'Pyramids and Sphinx day tour', published: true, price: 'available' },
      { slug: 'luxor-day-trip', other: 'excursion-luxor', name: 'Luxor day trip from Hurghada', published: true },
      { slug: 'alexandria-day', other: 'dia-alejandria', name: 'Alexandria in a day', published: true },
      { slug: 'felucca-sunset', other: 'falua-atardecer', name: 'Felucca at sunset', published: true },
    ],
  },
  'modern.localhost': {
    id: '00000000-0000-4000-8000-00000000f002', tenantId: '00000000-0000-4000-8000-00000000f001',
    archetype: 'modern', status: 'draft', languages: ['en', 'fr'],
    companyName: 'Nile & Co (dev)', brand: {},
    // Blocks on a pretend agency website (embed-demo in .claude/launch.json).
    embed: { key: 'DevEmbedKeyNileCo2026xyz', origins: ['http://agency.localhost:8898'] },
    identity: { tagline: 'Egypt, your way', logoUrl: null, phone: '+20 2 2222 2222',
      email: 'hello@nileco.invalid', whatsapp: '+20 122 222 2222', address: 'Garden City, Cairo', licenseNumber: 'ETAA 2222 (dev)' },
    tours: [
      { slug: 'classic-nile-cruise', other: 'croisiere-classique', name: 'Classic Nile cruise: Luxor to Aswan', published: true, price: 'available', plan: 'nile' },
      { slug: 'pyramids-and-sphinx', other: 'pyramides-et-sphinx', name: 'Giza Pyramids and the Sphinx', published: true, price: 'available', plan: 'giza' },
      { slug: 'cairo-and-the-museum', other: 'le-caire-et-le-musee', name: 'Cairo and the Egyptian Museum', published: true, price: 'available', plan: 'cairo' },
      { slug: 'white-desert', other: 'desert-blanc', name: 'White Desert and the oases', published: true, plan: 'desert' },
    ],
  },
  'navy.localhost': {
    id: '00000000-0000-4000-8000-00000000f102', tenantId: '00000000-0000-4000-8000-00000000f101',
    archetype: 'modern', status: 'draft', languages: ['en', 'es'],
    companyName: 'Horizon Egypt (dev)',
    brand: { palette: { primary: '#1e2a78', accent: '#ff6b5b', ink: '#111827', surface: '#ffffff' }, fontPair: 'sleek' },
    identity: { tagline: 'Discover Egypt beyond the postcard', logoUrl: null, phone: null,
      email: 'trips@horizon.invalid', whatsapp: '+20 100 333 3333', address: null, licenseNumber: null },
    tours: [
      { slug: 'classic-nile-cruise', other: 'croisiere-classique', name: 'Classic Nile cruise: Luxor to Aswan', published: true, price: 'available', plan: 'nile' },
      { slug: 'pyramids-and-sphinx', other: 'pyramides-et-sphinx', name: 'Giza Pyramids and the Sphinx', published: true, price: 'available', plan: 'giza' },
      { slug: 'cairo-and-the-museum', other: 'le-caire-et-le-musee', name: 'Cairo and the Egyptian Museum', published: true, price: 'available', plan: 'cairo' },
      { slug: 'white-desert', other: 'desert-blanc', name: 'White Desert and the oases', published: true, plan: 'desert' },
    ],
  },
  'mono.localhost': {
    id: '00000000-0000-4000-8000-00000000f202', tenantId: '00000000-0000-4000-8000-00000000f201',
    archetype: 'modern', status: 'draft', languages: ['en', 'fr'],
    companyName: 'Kemet Trails (dev)',
    brand: { palette: { primary: '#161616', accent: '#c6f432', ink: '#161616', surface: '#ffffff' }, fontPair: 'clean' },
    identity: { tagline: 'Small groups. Big Egypt.', logoUrl: null, phone: '+20 2 4444 4444',
      email: 'go@kemet.invalid', whatsapp: null, address: 'Dokki, Giza', licenseNumber: 'ETAA 4444 (dev)' },
    tours: [
      { slug: 'classic-nile-cruise', other: 'croisiere-classique', name: 'Classic Nile cruise: Luxor to Aswan', published: true, price: 'available', plan: 'nile' },
      { slug: 'pyramids-and-sphinx', other: 'pyramides-et-sphinx', name: 'Giza Pyramids and the Sphinx', published: true, price: 'available', plan: 'giza' },
      { slug: 'cairo-and-the-museum', other: 'le-caire-et-le-musee', name: 'Cairo and the Egyptian Museum', published: true, price: 'available', plan: 'cairo' },
      { slug: 'white-desert', other: 'desert-blanc', name: 'White Desert and the oases', published: true, plan: 'desert' },
    ],
  },
}
// Invented facts, in the contract's shape (lib/publish/contract.ts tourFacts).
const PLANS = {
  giza: { durationDays: 1, durationNights: 0, days: [
    { day: 1, title: 'The pyramids and the Sphinx', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Giza Pyramids', 'Great Sphinx', 'Valley Temple of Khafre'] },
  ], mainAttractions: ['Giza Pyramids', 'Great Sphinx'], accommodation: [], inclusions: ['Egyptologist guide', 'Air-conditioned vehicle', 'Entrance fees to the sites listed', 'Lunch'], departureDays: ['mon', 'wed', 'fri', 'sat', 'sun'] },
  cairo: { durationDays: 3, durationNights: 2, days: [
    { day: 1, title: 'Arrival in Cairo', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: false, dinner: true }, sights: [] },
    { day: 2, title: 'The Egyptian Museum and Islamic Cairo', city: 'Cairo', overnight: true, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Egyptian Museum', 'Citadel of Salah El Din', 'Khan el-Khalili'] },
    { day: 3, title: 'Saqqara and Memphis', city: 'Saqqara', overnight: false, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Step Pyramid of Djoser', 'Memphis'] },
  ], mainAttractions: ['Egyptian Museum'], accommodation: [{ kind: 'hotel', name: 'Garden City House (dev)', city: 'Cairo' }], inclusions: ['2 nights with breakfast', 'Egyptologist guide', 'Entrance fees to the sites listed'], departureDays: ['thu', 'sat'] },
  desert: { durationDays: 3, durationNights: 2, days: [
    { day: 1, title: 'Cairo to Bahariya', city: 'Bahariya', overnight: true, meals: { breakfast: false, lunch: true, dinner: true }, sights: ['Black Desert'] },
    { day: 2, title: 'Into the White Desert', city: 'White Desert', overnight: true, meals: { breakfast: true, lunch: true, dinner: true }, sights: ['White Desert', 'Crystal Mountain'] },
    { day: 3, title: 'Back to Cairo', city: 'Cairo', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
  ], mainAttractions: ['White Desert'], accommodation: [{ kind: 'hotel', name: 'Oasis Eco Lodge (dev)', city: 'Bahariya' }], inclusions: ['1 night in a lodge, 1 night camping', '4x4 with driver', 'All meals in the desert'], departureDays: ['fri'] },
}

function facts(kind, currency, plan) {
  const base = {
    durationDays: 4, durationNights: 3, images: [],
    days: [
      { day: 1, title: 'Arrival in Luxor', city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: false, dinner: true }, sights: [] },
      { day: 2, title: 'The West Bank', city: 'Luxor', overnight: true, meals: { breakfast: true, lunch: true, dinner: true }, sights: ['Valley of the Kings', 'Temple of Hatshepsut'] },
      { day: 3, title: 'Edfu and Kom Ombo', city: 'Aswan', overnight: true, meals: { breakfast: true, lunch: true, dinner: true }, sights: ['Temple of Horus', 'Kom Ombo Temple'] },
      { day: 4, title: 'Philae and departure', city: 'Aswan', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: ['Philae Temple'] },
    ],
    mainAttractions: ['Valley of the Kings', 'Philae Temple'], highlights: [],
    inclusions: ['3 nights on the cruise, full board', 'Egyptologist guide', 'Entrance fees to the sites listed'],
    exclusions: ['International flights', 'Visa', 'Tips'],
    accommodation: [{ kind: 'cruise', name: 'MS Example Star', city: null }],
    groupSize: { min: 2, max: 12 },
    departureDays: ['mon', 'fri'],
    departures: [{ date: '2026-11-16', endDate: '2026-11-19', status: 'guaranteed', seatsLeft: 4 }, { date: '2026-11-20', endDate: '2026-11-23', status: 'full', seatsLeft: 0 }],
    cancellation: { tiers: [{ daysBefore: 30, chargePercent: 25 }, { daysBefore: 7, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    publishable: { ok: true, reasons: [] },
    ...(PLANS[plan] ?? {}),
  }
  if (kind === 'on_request') {
    return { ...base, price: { status: 'on_request', currency, tierLabel: null, fromPrice: null, bands: [], indicative: [] },
      publishable: { ok: false, reasons: ['The tour has no public price yet — review the price and publish it.'] } }
  }
  // One public rate: per person for every count in the group size (2–12).
  return { ...base, price: { status: 'available', currency, tierLabel: 'Deluxe', fromPrice: 698.25,
    bands: [{ minPax: 2, maxPax: 3, perPerson: 910 }, { minPax: 4, maxPax: 5, perPerson: 802.5 }, { minPax: 6, maxPax: 12, perPerson: 698.25 }],
    indicative: [{ currency: 'USD', rate: 1.075, rateDate: new Date().toISOString().slice(0, 10) }] } }
}

const byId = Object.fromEntries(Object.values(SITES).map(s => [s.id, s]))

function siteInfo(s) {
  return { id: s.id, tenantId: s.tenantId, archetype: s.archetype, companyName: s.companyName, languages: s.languages, brand: s.brand, identity: s.identity }
}

function resolution(host) {
  const s = SITES[host]
  if (s) {
    return { site: { id: s.id, tenantId: s.tenantId, archetype: s.archetype, status: s.status, languages: s.languages, companyName: s.companyName, brand: s.brand },
      domain: { hostname: host, kind: 'test' }, primaryHost: null, preview: true,
      redirects: [{ from: '/old-nile', to: '/en/tours/nile-classic', status: 301 }] }
  }
  if (host === 'www.sillage.localhost') {
    const p = SITES['sillage.localhost']
    return { site: { id: p.id, tenantId: p.tenantId, archetype: p.archetype, status: 'live', languages: p.languages, companyName: p.companyName, brand: p.brand },
      domain: { hostname: host, kind: 'alias_redirect' }, primaryHost: 'sillage.example', preview: false, redirects: [] }
  }
  return null
}

function page(s, lang, path, preview) {
  if (!s.languages.includes(lang)) return null
  const second = lang !== 'en'
  const other = second ? 'en' : s.languages[1]
  const slugIn = (t, l) => (l === 'en' ? t.slug : t.other)
  const list = s.tours.filter(t => t.published || preview)
  // Cards and destinations, as lib/publish/site-data.ts builds them (cardOf, placeSlug).
  const placeSlug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const factsOf = t => facts(t.price ?? 'on_request', 'EUR', t.plan)
  const cardFor = f => ({ days: f.durationDays, nights: f.durationNights, cities: [...new Set(f.days.map(d => d.city).filter(Boolean))],
    from: f.price.status === 'available' && f.price.fromPrice !== null ? { amount: f.price.fromPrice, currency: f.price.currency } : null, image: f.images[0] ?? null })
  const links = list.map(t => ({ title: t.name, path: `tours/${slugIn(t, lang)}`, card: cardFor(factsOf(t)) }))
  const places = new Map()
  for (const t of list) for (const c of cardFor(factsOf(t)).cities) {
    const p = places.get(placeSlug(c)) ?? { name: c, tours: new Set() }
    p.tours.add(`tours/${slugIn(t, lang)}`); places.set(placeSlug(c), p)
  }
  const destinations = [...places].map(([slug, p]) => ({ name: p.name, path: `destinations/${slug}`, count: p.tours.size })).sort((a, b) => b.count - a.count)
  const base = { language: lang, site: siteInfo(s), tour: null, tours: [], unpublished: false, destinations }
  if (path === '') return { ...base, kind: 'home', path: '', title: s.companyName, alternates: [{ language: other, path: '' }], tours: links }
  if (path === 'tours') return { ...base, kind: 'listing', path: 'tours', title: s.companyName, alternates: [{ language: other, path: 'tours' }], tours: links }
  const dm = path.match(/^destinations\/([a-z0-9-]+)$/)
  if (dm) {
    const p = places.get(dm[1])
    if (!p) return null
    return { ...base, kind: 'destination', path, title: p.name, destination: { name: p.name, slug: dm[1] },
      alternates: [{ language: other, path }], tours: links.filter(l => p.tours.has(l.path)) }
  }
  const m = path.match(/^tours\/([a-z0-9-]+)$/)
  const t = m && list.find(x => slugIn(x, lang) === m[1])
  if (!t) return null
  return { ...base, kind: 'tour', path, title: t.name, unpublished: !t.published,
    tour: { templateId: '00000000-0000-4000-8000-00000000d003', name: t.name, facts: facts(t.price ?? 'on_request', 'EUR', t.plan),
      // Approved text (step 7), for the priced tours — slots filled by the renderer.
      narrative: t.price === 'available' && (!t.plan || t.plan === 'nile') ? {
        overview: [
          { type: 'text', text: 'Sail between the great temples of Upper Egypt at the pace of the river, with an Egyptologist at your side. From' },
          { type: 'slot', slot: 'price_from' },
          { type: 'text', text: '.\n\nEvenings are for the deck, the light on the water and dinner as the banks slip by.' },
        ],
        highlights: [[{ type: 'text', text: 'The Valley of the Kings before the heat' }], [{ type: 'text', text: 'Philae Temple by motorboat' }], [{ type: 'text', text: 'Departing' }, { type: 'slot', slot: 'departure_days' }]],
        days: [{ day: 2, segments: [{ type: 'text', text: 'Cross to the West Bank early, while the valley is still cool, and descend into the tombs of the pharaohs.' }] }],
        seo: { title: `${t.name} — a Nile journey`, description: 'Temples, tombs and the river, with an Egyptologist.' },
      } : null },
    alternates: [{ language: other, path: `tours/${slugIn(t, other)}` }] }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  // Dev only: rename a company, to watch a revalidation reach a cached page.
  //   curl -X POST 'http://127.0.0.1:4010/dev/company-name?host=sillage.localhost&name=New+name'
  if (req.method === 'POST' && url.pathname === '/dev/company-name') {
    const s = SITES[url.searchParams.get('host') || 'sillage.localhost']
    if (s) s.companyName = url.searchParams.get('name') || s.companyName
    return send(200, { companyName: s?.companyName })
  }
  // Dev only: the last enquiry the renderer forwarded, to check what reached the app.
  if (req.method === 'GET' && url.pathname === '/dev/last-enquiry') return send(200, globalThis.lastEnquiry ?? null)
  if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: 'Unauthorized' })
  if (req.method === 'POST' && url.pathname === '/api/publish/internal/enquiry') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => { globalThis.lastEnquiry = JSON.parse(body || 'null'); send(201, { ok: true, enquiryId: '00000000-0000-4000-8000-0000000000e1' }) })
    return
  }
  if (url.pathname === '/api/publish/internal/site') {
    const r = resolution(url.searchParams.get('host'))
    return r ? send(200, r) : send(404, { error: 'No site for this hostname' })
  }
  if (url.pathname === '/api/publish/internal/embed') {
    const s = Object.values(SITES).find(x => x.embed?.key === url.searchParams.get('key'))
    if (!s) return send(404, { error: 'No such embed key' })
    return send(200, { site: { id: s.id, tenantId: s.tenantId, archetype: s.archetype, status: s.status, languages: s.languages, companyName: s.companyName, brand: s.brand }, origins: s.embed.origins })
  }
  if (url.pathname === '/api/publish/internal/page') {
    const s = byId[url.searchParams.get('site')]
    const p = s && page(s, url.searchParams.get('lang'), url.searchParams.get('path') || '', url.searchParams.get('preview') === '1')
    return p ? send(200, p) : send(404, { error: 'No such page' })
  }
  send(404, { error: 'not found' })
}).listen(PORT, () => console.log(`[publish-dev-api] listening on :${PORT}`))
