import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SUPPORTED_LANGUAGES, colon, countOf, t, type StringKey } from '../i18n/strings'
import { fr } from '../i18n/fr'
import { es } from '../i18n/es'
import { formatDate, formatPercent, formatPrice, formatWeekdays } from '../themes/blocks/format'
import { narrativeText } from '../themes/blocks/narrative'
import { whatsAppLink } from '../lib/lead-capture'
import { THEMES } from '../themes'
import type { PagePayload, TourFacts } from '@/lib/publish/contract'

// ============================================================================
// The second language (step 10, PLAN D14): every site is English plus ONE of
// the supported left-to-right languages — French or Spanish in Phase 1. A
// supported language has every interface word, and its own way of writing
// prices, percentages, dates, weekdays and lists. No right-to-left language.
// ============================================================================

const english = (key: StringKey) => t('en', key)

describe('the supported languages', () => {
  it('are English, French and Spanish — left to right only', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'fr', 'es'])
    for (const rtl of ['ar', 'he', 'fa', 'ur']) expect(SUPPORTED_LANGUAGES).not.toContain(rtl)
  })

  // Words that are the same in the language (or a brand-neutral label).
  const SAME: Partial<Record<string, StringKey[]>> = { fr: ['contact', 'menu', 'licensed'], es: [] }
  for (const [lang, dict] of [['fr', fr], ['es', es]] as const) {
    it(`${lang}: every word is there, filled in, and actually translated`, () => {
      for (const key of Object.keys(dict) as StringKey[]) {
        expect(dict[key].trim(), `${lang}.${key}`).not.toBe('')
        if (!SAME[lang]?.includes(key)) expect(dict[key], `${lang}.${key} is still English`).not.toBe(english(key))
      }
    })
  }

  it('a language no site may use falls back to English, never to a blank', () => {
    expect(t('de', 'itinerary')).toBe('Itinerary')
  })
})

describe('numbers, dates and lists the way each language writes them', () => {
  it('prices — still rounded up, never below the real price', () => {
    expect(formatPrice(1233.2, 'EUR', 'en')).toBe('€1,234')
    expect(formatPrice(1233.2, 'EUR', 'fr')).toBe('1 234 €')
    expect(formatPrice(1233.2, 'EUR', 'es')).toBe('1234 €')
  })
  it('percentages, dates and weekdays', () => {
    expect(formatPercent(25, 'fr')).toBe('25 %')
    expect(formatPercent(25, 'en')).toBe('25%')
    expect(formatDate('2026-10-27', 'fr')).toBe('27 oct. 2026')
    expect(formatWeekdays(['mon', 'fri'], 'fr')).toBe('lundi et vendredi')
    expect(formatWeekdays(['tue', 'sat'], 'es')).toBe('martes y sábado')
  })
  it('durations and the French colon', () => {
    expect(countOf('fr', 1, 'day')).toBe('1 jour')
    expect(countOf('es', 5, 'night')).toBe('5 noches')
    expect(colon('fr')).toBe(' :')
    expect(colon('es')).toBe(':')
  })
})

const FACTS = {
  durationDays: 5, durationNights: 4, images: [],
  days: [{ day: 1, title: 'Arrivée au Caire', city: 'Cairo', overnight: true, meals: { breakfast: true, lunch: false, dinner: false }, sights: ['Giza Pyramids'] }],
  mainAttractions: [], highlights: ['Giza Pyramids'], inclusions: ['Guide'], exclusions: ['Visa'], accommodation: [],
  groupSize: { min: 2, max: 12 }, departureDays: ['sat'], departures: [],
  cancellation: { tiers: [{ daysBefore: 30, chargePercent: 25 }], wording: null },
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 440.2, tier: 'standard', tierLabel: 'Standard' },
    byNationality: { eu: 440.2, other: 425.5 }, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
} as unknown as TourFacts

function frenchTourPage(archetype: PagePayload['site']['archetype']): PagePayload {
  return {
    kind: 'tour', language: 'fr', path: 'tours/cinq-jours', title: 'Cinq jours au Caire',
    site: { id: '00000000-0000-4000-8000-0000000000bb', tenantId: '00000000-0000-4000-8000-0000000000aa', archetype,
      companyName: 'Co Voyages', languages: ['en', 'fr'], brand: {}, publicHost: null,
      identity: { tagline: null, logoUrl: null, phone: null, email: 'bonjour@co.example', whatsapp: null, address: null, licenseNumber: null } },
    alternates: [{ language: 'en', path: 'tours/five-days' }],
    tour: { templateId: '00000000-0000-4000-8000-0000000000dd', name: 'Cinq jours au Caire', facts: FACTS, narrative: null },
    tours: [], unpublished: false, pageId: null,
  }
}

describe('a French tour page', () => {
  for (const archetype of ['private_journeys', 'transparent_value'] as const) {
    it(`${archetype}: its interface is French, its prices and terms written the French way`, () => {
      const theme = THEMES[archetype]
      const page = frenchTourPage(archetype)
      const html = renderToStaticMarkup(<theme.Frame page={page} preview={false}><theme.Page page={page} preview={false} /></theme.Frame>)
      const text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t\r\n]+/g, ' ')
      for (const word of ['Itinéraire', 'Ce qui est inclus', 'Non inclus', 'Titulaires d’un passeport de l’UE', 'Autres nationalités', 'Envoyer la demande', '5 jours · 4 nuits', 'Départs\u202f: samedi']) {
        expect(text, word).toContain(word)
      }
      expect(text).toContain('441 €')
      expect(text).toContain('30 jours ou moins avant le départ : 25 % retenus en cas d’annulation')
      for (const english of ['Itinerary', 'What is included', 'Not included', 'per person', 'Send enquiry', 'EU passport holders']) {
        expect(text, english).not.toContain(english)
      }
    })
  }

  it('the approved text fills its slots in French', () => {
    expect(narrativeText([{ type: 'text', text: 'Un voyage de' }, { type: 'slot', slot: 'duration' }], FACTS, 'fr')).toBe('Un voyage de 5 jours / 4 nuits')
  })
})

describe('the WhatsApp message', () => {
  it('is written in the page language; the reference stays "Ref:" so the inbox can read it', () => {
    const text = (lang: string) => decodeURIComponent(whatsAppLink({ number: '+201551772258', token: 'ABCD2345', tourName: 'Saqqara' }, lang)!.split('text=')[1])
    expect(text('fr')).toBe('Bonjour, je suis intéressé(e) par Saqqara.\n\nRef: ABCD2345')
    expect(text('es')).toBe('Hola, me interesa Saqqara.\n\nRef: ABCD2345')
  })
})
