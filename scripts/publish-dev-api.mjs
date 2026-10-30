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
 *   one.localhost           Modern, ONE tour in one place (the Sandbox's navy + violet)
 *   six.localhost           Modern, six tours in four places
 *   many.localhost          Modern, nine tours — the large-catalogue Tours page
 *   anything else           no site
 *
 * The fixture is shaped by lib/publish/contract.ts — keep it in step.
 * Its companies, numbers and tours are invented for development.
 */

import http from 'node:http'

const PORT = Number(process.env.PORT || 4010)
const SECRET = process.env.PUBLISH_INTERNAL_SECRET || 'dev-internal'

// The About page's own parts (a website-only list; dev data, no photos).
const ABOUT = {
  headline: 'A Cairo team that has shown Egypt to travellers since 2012.',
  teamPhoto: null,
  people: [
    { name: 'Mona Adel', role: 'Egyptologist', kind: 'guide', languages: ['en', 'es'], photo: null },
    { name: 'Karim Fathy', role: 'Egyptologist', kind: 'guide', languages: ['en', 'de'], photo: null },
    { name: 'Hana Samir', role: 'Egyptologist', kind: 'guide', languages: ['en', 'fr'], photo: null },
    { name: 'Omar Nabil', role: 'Trip planner', kind: 'staff', languages: ['en', 'fr'], photo: null },
  ],
}

const SIX = [
  { slug: 'saqqara-and-the-first-pyramids', other: 'saqqarah-et-les-premieres-pyramides', name: 'Saqqara and the First Pyramids', published: true, price: 'available', plan: 'saqqara' },
  { slug: 'giza-pyramids-and-the-sphinx', other: 'pyramides-de-gizeh', name: 'Giza Pyramids and the Sphinx', published: true, price: 'available', plan: 'giza' },
  { slug: 'egyptian-museum-and-old-cairo', other: 'musee-egyptien-et-vieux-caire', name: 'Egyptian Museum and Old Cairo', published: true, price: 'available', plan: 'museum' },
  { slug: 'luxor-east-and-west-banks', other: 'louxor-rives-est-et-ouest', name: 'Luxor East and West Banks', published: true, price: 'available', plan: 'luxor' },
  { slug: 'luxor-to-aswan-nile-cruise', other: 'croisiere-louxor-assouan', name: 'Luxor to Aswan Nile cruise', published: true, price: 'available', plan: 'nile' },
  { slug: 'abu-simbel-from-aswan', other: 'abou-simbel-depuis-assouan', name: 'Abu Simbel from Aswan', published: true, price: 'available', plan: 'abusimbel' },
]

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
    companyName: 'Nile & Co (dev)',
    about: { en: 'Nile & Co is a family business from Garden City, Cairo (dev text).\n\nOur Egyptologist guides have shown travellers the Nile valley for twenty years — every tour is private, just your group.' },
    brand: { claims: ['Egyptologist guides on every tour', 'Private tours — just your group'] },
    // Invented Google reviews, to see the reviews sections in dev.
    reviews: { name: 'Nile & Co (dev)', rating: 4.8, count: 312, url: null, reviews: [
      { author: 'Sam (dev)', authorUrl: null, authorPhoto: null, rating: 5, text: 'Our guide made the pyramids come alive. Pickup on time, everything as promised.', translated: false, original: null, when: '2 weeks ago', url: null },
      { author: 'Léa (dev)', authorUrl: null, authorPhoto: null, rating: 5, text: 'A perfect day in Giza — clear price, no surprises.', translated: true, original: null, when: 'a month ago', url: null },
      { author: 'Marco (dev)', authorUrl: null, authorPhoto: null, rating: 4, text: 'Great cruise, the Philae boat ride was the highlight.', translated: false, original: null, when: '3 months ago', url: null },
    ] },
    // Blocks on a pretend agency website (embed-demo in .claude/launch.json).
    embed: { key: 'DevEmbedKeyNileCo2026xyz', origins: ['http://agency.localhost:8898'] },
    identity: { tagline: 'Egypt, your way', logoUrl: null, phone: '+20 2 2222 2222',
      email: 'hello@nileco.invalid', whatsapp: '+20 122 222 2222', address: '12 Garden City St, Cairo', licenseNumber: 'ETAA 2222 (dev)',
      legalEntity: 'Nile & Co Travel S.A.E. (dev)', termsUrl: 'https://nileco.invalid/terms', privacyUrl: 'https://nileco.invalid/privacy' },
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
  'one.localhost': {
    id: '00000000-0000-4000-8000-00000000a102', tenantId: '00000000-0000-4000-8000-00000000a101',
    archetype: 'modern', status: 'draft', languages: ['en', 'fr'],
    brand: { palette: { primary: '#111c44', accent: '#a78bfa', ink: '#14161c', surface: '#ffffff' }, fontPair: 'manrope' },
    companyName: 'Autoura Sandbox (dev)',
    identity: { tagline: 'Private tours in Egypt', logoUrl: null, phone: null,
      email: 'hello@sandbox.invalid', whatsapp: '+20 100 555 0101', address: '14 Champollion St, Downtown, Cairo', licenseNumber: '2241 (dev)',
      legalEntity: 'Sandbox Travel S.A.E. (dev)', termsUrl: 'https://sandbox.invalid/terms', privacyUrl: 'https://sandbox.invalid/privacy',
      headline: null, foundedYear: 2012, hours: { opens: '09:00', closes: '21:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } },
    about: { en: 'We are a small Cairo company (dev text). Our founders guided for twenty years before starting their own agency.\n\nEvery tour is private: your guide, your driver, your pace.' },
    aboutPage: ABOUT,
    tours: [
      { slug: 'saqqara-and-the-first-pyramids', other: 'saqqarah-et-les-premieres-pyramides', name: 'Saqqara and the First Pyramids', published: true, price: 'available', plan: 'saqqara' },
    ],
  },
  'six.localhost': {
    id: '00000000-0000-4000-8000-00000000a202', tenantId: '00000000-0000-4000-8000-00000000a201',
    archetype: 'modern', status: 'draft', languages: ['en', 'fr'],
    brand: { palette: { primary: '#111c44', accent: '#a78bfa', ink: '#14161c', surface: '#ffffff' }, fontPair: 'manrope' },
    companyName: 'Autoura Sandbox (dev)',
    identity: { tagline: 'Private tours in Egypt', logoUrl: null, phone: null,
      email: 'hello@sandbox.invalid', whatsapp: '+20 100 555 0101', address: '14 Champollion St, Downtown, Cairo', licenseNumber: '2241 (dev)',
      legalEntity: 'Sandbox Travel S.A.E. (dev)', termsUrl: 'https://sandbox.invalid/terms', privacyUrl: 'https://sandbox.invalid/privacy',
      headline: null, foundedYear: 2012, hours: { opens: '09:00', closes: '21:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } },
    about: { en: 'We are a small Cairo company (dev text). Our founders guided for twenty years before starting their own agency.\n\nEvery tour is private: your guide, your driver, your pace.' },
    aboutPage: ABOUT,
    tours: SIX,
  },
  'many.localhost': {
    id: '00000000-0000-4000-8000-00000000a302', tenantId: '00000000-0000-4000-8000-00000000a301',
    archetype: 'modern', status: 'draft', languages: ['en', 'fr'],
    brand: { palette: { primary: '#111c44', accent: '#a78bfa', ink: '#14161c', surface: '#ffffff' }, fontPair: 'manrope' },
    companyName: 'Autoura Sandbox (dev)',
    identity: { tagline: 'Private tours in Egypt', logoUrl: null, phone: null,
      email: 'hello@sandbox.invalid', whatsapp: '+20 100 555 0101', address: '14 Champollion St, Downtown, Cairo', licenseNumber: '2241 (dev)',
      legalEntity: 'Sandbox Travel S.A.E. (dev)', termsUrl: 'https://sandbox.invalid/terms', privacyUrl: 'https://sandbox.invalid/privacy',
      headline: null, foundedYear: 2012, hours: { opens: '09:00', closes: '21:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } },
    about: { en: 'We are a small Cairo company (dev text). Our founders guided for twenty years before starting their own agency.\n\nEvery tour is private: your guide, your driver, your pace.' },
    aboutPage: ABOUT,
    tours: [...SIX,
      { slug: 'alexandria-in-a-day', other: 'alexandrie-en-un-jour', name: 'Alexandria in a day', published: true, price: 'available', plan: 'alex' },
      { slug: 'white-desert', other: 'desert-blanc', name: 'White Desert and the oases', published: true, plan: 'desert' },
      { slug: 'cairo-in-depth', other: 'le-caire-en-profondeur', name: 'Cairo in depth', published: true, price: 'available', plan: 'cairo' },
    ],
  },
}
// Invented facts, in the contract's shape (lib/publish/contract.ts tourFacts).
const PLANS = {
  saqqara: { durationDays: 1, durationNights: 0, days: [
    { day: 1, title: 'Saqqara, Dahshur and Memphis', city: 'Cairo', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Step Pyramid of Djoser', 'Red Pyramid', 'Memphis Open-Air Museum'],
      stops: [{ time: '08:30', name: 'Hotel pickup in Cairo' }, { time: '09:30', name: 'Step Pyramid of Djoser' }, { time: '11:00', name: 'The tombs of Saqqara' }, { time: '12:30', name: 'Lunch' }, { time: '13:30', name: 'Red Pyramid at Dahshur' }, { time: '15:00', name: 'Memphis Open-Air Museum' }, { time: '16:30', name: 'Back at your hotel' }] },
  ], durationHours: 8, tourType: 'Day tour', guideLanguages: ['English', 'French', 'Spanish'], accommodation: [], departures: [],
    pickup: { included: true, area: 'Cairo', meetingPoint: null }, groupSize: { min: 1, max: 12 },
    cancellation: { tiers: [{ daysBefore: 2, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    highlights: ['The Step Pyramid of Djoser, the first pyramid ever built', 'The Red Pyramid at Dahshur', 'Memphis Open-Air Museum, with an Egyptologist guide'],
    mainAttractions: ['Step Pyramid of Djoser'], inclusions: ['Egyptologist guide', 'Air-conditioned car with driver', 'Hotel pickup and drop-off', 'Entrance fees to the sites listed', 'Lunch'],
    exclusions: ['Tips for guide and driver', 'Drinks'], departureDays: ['mon', 'wed', 'fri', 'sun'],
    bands: [{ minPax: 1, maxPax: 1, perPerson: 150 }, { minPax: 2, maxPax: 3, perPerson: 105 }, { minPax: 4, maxPax: 5, perPerson: 80 }, { minPax: 6, maxPax: 12, perPerson: 58 }] },
  museum: { durationDays: 1, durationNights: 0,
    // Three photos (Wikimedia, dev only), to see the gallery swipe on a phone.
    images: ['https://commons.wikimedia.org/wiki/Special:FilePath/Egyptian_Museum_Cairo.jpg?width=1200', 'https://commons.wikimedia.org/wiki/Special:FilePath/Cairo_From_Tower_(cropped).jpg?width=1200', 'https://commons.wikimedia.org/wiki/Special:FilePath/All_Gizah_Pyramids.jpg?width=1200'],
    days: [
    { day: 1, title: 'The Egyptian Museum and Old Cairo', city: 'Cairo', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Egyptian Museum', 'Hanging Church', 'Khan el-Khalili'] },
  ], durationHours: 7, tourType: 'Day tour', guideLanguages: ['English', 'French', 'Spanish'], accommodation: [], departures: [],
    pickup: { included: true, area: 'Cairo', meetingPoint: null }, groupSize: { min: 1, max: 12 },
    cancellation: { tiers: [{ daysBefore: 2, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    highlights: ['Museum highlights', 'Coptic Cairo', 'Khan el-Khalili'], mainAttractions: ['Egyptian Museum'], inclusions: ['Egyptologist guide', 'Entrance fees to the sites listed', 'Lunch'],
    exclusions: ['Tips for guide and driver'], departureDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    bands: [{ minPax: 1, maxPax: 3, perPerson: 95 }, { minPax: 4, maxPax: 12, perPerson: 64 }] },
  luxor: { durationDays: 2, durationNights: 1, days: [
    { day: 1, title: 'The East Bank', city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Karnak Temple', 'Luxor Temple'] },
    { day: 2, title: 'The West Bank', city: 'Luxor', overnight: false, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Valley of the Kings', 'Temple of Hatshepsut'] },
  ], tourType: 'Multi-day', guideLanguages: ['English', 'French'], durationHours: null, departures: [],
    highlights: ['Karnak, Luxor Temple and the Valley of the Kings'], mainAttractions: ['Karnak Temple'], accommodation: [{ kind: 'hotel', name: 'Nile-view hotel (dev)', city: 'Luxor' }],
    inclusions: ['1 night with breakfast', 'Egyptologist guide', 'Entrance fees to the sites listed'], exclusions: ['Tips for guide and driver'], departureDays: ['tue', 'sat'],
    bands: [{ minPax: 2, maxPax: 3, perPerson: 340 }, { minPax: 4, maxPax: 12, perPerson: 265 }] },
  abusimbel: { durationDays: 1, durationNights: 0, days: [
    { day: 1, title: 'Abu Simbel', city: 'Aswan', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: ['Abu Simbel temples'] },
  ], durationHours: 10, tourType: 'Day tour', guideLanguages: ['English', 'French', 'Spanish'], accommodation: [], departures: [],
    pickup: { included: true, area: 'Aswan', meetingPoint: null }, groupSize: { min: 1, max: 12 },
    cancellation: { tiers: [{ daysBefore: 2, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    highlights: ['The temples of Ramesses II and Nefertari'], mainAttractions: ['Abu Simbel temples'], inclusions: ['Egyptologist guide', 'Air-conditioned car with driver', 'Entrance fees to the sites listed'],
    exclusions: ['Tips for guide and driver'], departureDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    bands: [{ minPax: 1, maxPax: 3, perPerson: 210 }, { minPax: 4, maxPax: 12, perPerson: 145 }] },
  alex: { durationDays: 1, durationNights: 0, days: [
    { day: 1, title: 'Alexandria', city: 'Alexandria', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Citadel of Qaitbay', 'Library of Alexandria', 'Catacombs of Kom el-Shoqafa'] },
  ], durationHours: 12, tourType: 'Day tour', guideLanguages: ['English', 'French', 'Spanish'], accommodation: [], departures: [],
    pickup: { included: true, area: 'Cairo', meetingPoint: null }, groupSize: { min: 1, max: 12 },
    cancellation: { tiers: [{ daysBefore: 2, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }], wording: null },
    highlights: ['The Citadel of Qaitbay', 'The Library of Alexandria'], mainAttractions: ['Citadel of Qaitbay'], inclusions: ['Egyptologist guide', 'Air-conditioned car with driver', 'Lunch'],
    exclusions: ['Tips for guide and driver'], departureDays: ['sat', 'sun'],
    bands: [{ minPax: 1, maxPax: 3, perPerson: 180 }, { minPax: 4, maxPax: 12, perPerson: 120 }] },
  giza: { durationDays: 1, durationNights: 0, days: [
    { day: 1, title: 'The pyramids and the Sphinx', city: 'Giza', overnight: false, meals: { breakfast: false, lunch: true, dinner: false }, sights: ['Giza Pyramids', 'Great Sphinx', 'Valley Temple of Khafre'],
      stops: [{ time: '08:00', name: 'Hotel pickup in Cairo or Giza' }, { time: '09:00', name: 'Giza Pyramids' }, { time: '11:00', name: 'Panorama point' }, { time: '11:45', name: 'Great Sphinx and the Valley Temple of Khafre' }, { time: '13:00', name: 'Lunch' }, { time: '14:30', name: 'Back at your hotel' }] },
  ], durationHours: 7, tourType: 'Day tour', guideLanguages: ['English', 'French', 'Spanish'],
  pickup: { included: true, area: 'Cairo and Giza', meetingPoint: 'Your guide meets you in the hotel lobby, holding a Nile & Co sign.' },
  faq: [
    { question: 'Is the inside of the Great Pyramid included?', answer: 'No — entry to the inside of the Great Pyramid is a separate ticket. Your guide can buy it for you on the day.' },
    { question: 'What should I wear?', answer: 'Comfortable shoes and a hat. The plateau has little shade.' },
    { question: 'Can we start earlier?', answer: 'Yes. Tell us in your enquiry and we will set the pickup time with you.' },
  ], mainAttractions: ['Giza Pyramids', 'Great Sphinx'], accommodation: [], inclusions: ['Egyptologist guide', 'Air-conditioned vehicle', 'Entrance fees to the sites listed', 'Lunch'], departureDays: ['mon', 'wed', 'fri', 'sat', 'sun'] },
  cairo: { durationDays: 3, durationNights: 2, days: [
    { day: 1, title: 'Arrival in Cairo', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: false, dinner: true }, sights: [] },
    { day: 2, title: 'The Egyptian Museum and Islamic Cairo', city: 'Cairo', overnight: true, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Egyptian Museum', 'Citadel of Salah El Din', 'Khan el-Khalili'] },
    { day: 3, title: 'Saqqara and Memphis', city: 'Saqqara', overnight: false, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Step Pyramid of Djoser', 'Memphis'] },
  ], tourType: 'Multi-day tour', guideLanguages: ['English', 'French'], mainAttractions: ['Egyptian Museum'], accommodation: [{ kind: 'hotel', name: 'Garden City House (dev)', city: 'Cairo' }], inclusions: ['2 nights with breakfast', 'Egyptologist guide', 'Entrance fees to the sites listed'], departureDays: ['thu', 'sat'] },
  desert: { durationDays: 3, durationNights: 2, days: [
    { day: 1, title: 'Cairo to Bahariya', city: 'Bahariya', overnight: true, meals: { breakfast: false, lunch: true, dinner: true }, sights: ['Black Desert'] },
    { day: 2, title: 'Into the White Desert', city: 'White Desert', overnight: true, meals: { breakfast: true, lunch: true, dinner: true }, sights: ['White Desert', 'Crystal Mountain'] },
    { day: 3, title: 'Back to Cairo', city: 'Cairo', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
  ], tourType: 'Desert safari', mainAttractions: ['White Desert'], accommodation: [{ kind: 'hotel', name: 'Oasis Eco Lodge (dev)', city: 'Bahariya' }], inclusions: ['1 night in a lodge, 1 night camping', '4x4 with driver', 'All meals in the desert'], departureDays: ['fri'] },
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
    cancellation: { tiers: [{ daysBefore: 45, chargePercent: 10 }, { daysBefore: 30, chargePercent: 25 }, { daysBefore: 7, chargePercent: 50 }], wording: null },
    tourType: 'Nile cruise', guideLanguages: ['English'], durationHours: null,
    pickup: { included: true, area: 'Luxor', meetingPoint: null },
    publishable: { ok: true, reasons: [] },
    ...(PLANS[plan] ?? {}),
  }
  if (kind === 'on_request') {
    delete base.bands
    return { ...base, price: { status: 'on_request', currency, tierLabel: null, fromPrice: null, bands: [], indicative: [] },
      publishable: { ok: false, reasons: ['The tour has no public price yet — review the price and publish it.'] } }
  }
  // One public rate: per person for every count in the group size (2–12).
  const bands = base.bands ?? [{ minPax: 2, maxPax: 3, perPerson: 910 }, { minPax: 4, maxPax: 5, perPerson: 802.5 }, { minPax: 6, maxPax: 12, perPerson: 698.25 }]
  delete base.bands
  return { ...base, price: { status: 'available', currency, tierLabel: 'Deluxe', fromPrice: Math.min(...bands.map(b => b.perPerson)),
    bands,
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
    from: f.price.status === 'available' && f.price.fromPrice !== null ? { amount: f.price.fromPrice, currency: f.price.currency } : null, image: f.images[0] ?? null,
    type: f.tourType ?? null, hours: f.durationHours ?? null,
    highlights: (f.highlights.length ? f.highlights : f.mainAttractions).slice(0, 3),
    places: [...new Set([...f.days.flatMap(d => d.sights), ...f.mainAttractions, ...f.days.map(d => d.city).filter(Boolean)])].slice(0, 12),
    guideLanguages: f.guideLanguages ?? [] })
  const links = list.map(t => ({ title: t.name, path: `tours/${slugIn(t, lang)}`, card: cardFor(factsOf(t)) }))
  const places = new Map()
  for (const t of list) for (const c of cardFor(factsOf(t)).cities) {
    const p = places.get(placeSlug(c)) ?? { name: c, tours: new Set() }
    p.tours.add(`tours/${slugIn(t, lang)}`); places.set(placeSlug(c), p)
  }
  const destinations = [...places].map(([slug, p]) => ({ name: p.name, path: `destinations/${slug}`, count: p.tours.size })).sort((a, b) => b.count - a.count)
  const base = { language: lang, site: siteInfo(s), tour: null, tours: [], unpublished: false, destinations }
  if (path === '') return { ...base, kind: 'home', path: '', title: s.companyName, alternates: [{ language: other, path: '' }], tours: links, ...(s.reviews ? { reviews: s.reviews } : {}) }
  if (path === 'about' || path === 'contact') return { ...base, kind: path, path, title: s.companyName, alternates: [{ language: other, path }], pageId: null,
    ...(path === 'about' && s.aboutPage ? { aboutPage: s.aboutPage } : {}),
    ...(path === 'contact' ? { interests: destinations.map(d => d.name).slice(0, 8) } : {}), ...(s.reviews && path === 'about' ? { reviews: s.reviews } : {}),
    ...(path === 'about' && s.about?.[lang] ? { about: s.about[lang] } : {}) }
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
    ...(s.reviews ? { reviews: s.reviews } : {}),
    related: links.filter(l => l.path !== `tours/${slugIn(t, lang)}`).slice(0, 3),
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
