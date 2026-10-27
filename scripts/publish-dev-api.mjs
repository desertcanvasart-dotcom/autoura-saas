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
}
// Invented facts, in the contract's shape (lib/publish/contract.ts tourFacts).
function facts(kind, currency) {
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
  }
  if (kind === 'on_request') {
    return { ...base, price: { status: 'on_request', currency, basis: { pax: 2, season: 'lowest' }, from: null, byNationality: null, table: [], indicative: [] },
      publishable: { ok: false, reasons: ['No tier of the tour has a complete price — every rate it needs must be entered.'] } }
  }
  return { ...base, price: { status: 'available', currency, basis: { pax: 2, season: 'lowest' },
    from: { perPerson: 840.4, tier: 'deluxe', tierLabel: 'Deluxe' }, byNationality: { eu: 910, other: 840.4 },
    table: [{ pax: 2, perPerson: null, eu: 910, other: 840.4 }, { pax: 4, perPerson: null, eu: 802.5, other: 735 }, { pax: 6, perPerson: null, eu: 760, other: 698.25 }],
    indicative: [{ currency: 'USD', perPerson: 905, rateDate: '2026-10-25' }] } }
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
  const links = list.map(t => ({ title: t.name, path: `tours/${slugIn(t, lang)}` }))
  const base = { language: lang, site: siteInfo(s), tour: null, tours: [], unpublished: false }
  if (path === '') return { ...base, kind: 'home', path: '', title: s.companyName, alternates: [{ language: other, path: '' }], tours: links }
  if (path === 'tours') return { ...base, kind: 'listing', path: 'tours', title: s.companyName, alternates: [{ language: other, path: 'tours' }], tours: links }
  const m = path.match(/^tours\/([a-z0-9-]+)$/)
  const t = m && list.find(x => slugIn(x, lang) === m[1])
  if (!t) return null
  return { ...base, kind: 'tour', path, title: t.name, unpublished: !t.published,
    tour: { templateId: '00000000-0000-4000-8000-00000000d003', name: t.name, facts: facts(t.price ?? 'on_request', 'EUR') },
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
  if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: 'Unauthorized' })
  if (url.pathname === '/api/publish/internal/site') {
    const r = resolution(url.searchParams.get('host'))
    return r ? send(200, r) : send(404, { error: 'No site for this hostname' })
  }
  if (url.pathname === '/api/publish/internal/page') {
    const s = byId[url.searchParams.get('site')]
    const p = s && page(s, url.searchParams.get('lang'), url.searchParams.get('path') || '', url.searchParams.get('preview') === '1')
    return p ? send(200, p) : send(404, { error: 'No such page' })
  }
  send(404, { error: 'not found' })
}).listen(PORT, () => console.log(`[publish-dev-api] listening on :${PORT}`))
