// ============================================
// The site's own interface words (not the agency's content)
// ============================================
// Buttons, headings and labels the themes print, in English and in each
// supported second language (step 10, PLAN D14: French and Spanish in Phase
// 1). Each language's dictionary is complete by type (./fr.ts, ./es.ts). Left
// to right only — no right-to-left language is ever supported.

import { fr } from './fr'
import { es } from './es'

const en = {
  tours: 'Tours',
  allTours: 'All tours',
  home: 'Home',
  viewTour: 'View the journey',
  seeDetails: 'See details',
  planYourJourney: 'Plan your journey',
  askOnWhatsApp: 'Ask on WhatsApp',
  emailUs: 'Email us',
  callUs: 'Call us',
  contact: 'Contact',
  licensed: 'Licence',
  noToursYet: 'Our journeys will be listed here soon.',
  previewBanner: 'Preview — this site is not public',
  notYetPublished: 'Not yet published',
  pageNotFound: 'Page not found',
  pageNotFoundBody: 'This page does not exist. Our tours are listed on the home page.',
  languages: 'Languages',
  journeysTitle: 'Journeys',
  dealsTitle: 'Tours and day trips',
  menu: 'Menu',
  // ---- tour facts (step 5) ----
  itinerary: 'Itinerary',
  day: 'Day',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  overnightIn: 'Night in',
  sights: 'Visits',
  included: 'What is included',
  notIncluded: 'Not included',
  whereYouStay: 'Where you stay',
  nileCruise: 'Nile cruise',
  groupSize: 'Group size',
  travellers: 'travellers',
  upTo: 'up to',
  from: 'From',
  perPerson: 'per person',
  priceBasis: 'per person, based on 2 travellers sharing. Prices vary by travel date.',
  euPassport: 'EU passport holders',
  otherNationalities: 'Other nationalities',
  groupSizePrices: 'Price per person by group size',
  priceOnRequest: 'Price on request',
  askForPrice: 'Ask us for a price for your dates.',
  indicative: 'Indicative only',
  youPayIn: 'you pay in',
  rateOf: 'rate of',
  departs: 'Departs',
  upcomingDepartures: 'Upcoming departures',
  seatsLeft: 'seats left',
  guaranteed: 'Guaranteed',
  full: 'Full',
  cancellation: 'Cancellation',
  cancellationCharge: 'charged when cancelled',
  daysBeforeDeparture: 'days or fewer before departure',
  onDeparture: 'On the day of departure',
  highlights: 'Highlights',
  duration: 'Duration',
  oneDay: 'day',
  days: 'days',
  oneNight: 'night',
  nights: 'nights',
  // ---- enquiries (step 8) ----
  enquireTitle: 'Ask us about this journey',
  enquireGeneral: 'Send us an enquiry',
  yourName: 'Your name',
  yourEmail: 'Email',
  yourPhone: 'Phone (optional)',
  travellersLabel: 'Travellers',
  travelMonth: 'When would you like to travel?',
  yourMessage: 'Anything we should know?',
  sendEnquiry: 'Send enquiry',
  enquirySent: 'Thank you — your enquiry has reached us. We will reply soon.',
  enquirySlow: 'You have sent several enquiries just now. Please try again in a minute.',
  enquiryInvalid: 'Please check your name and email address, then send it again.',
  enquiryFailed: 'Your enquiry could not be sent just now. Please try again, or write to us directly.',
  orWhatsApp: 'Or message us on WhatsApp',
  waHello: 'Hello, I would like to plan a trip.',
  waInterestedIn: 'Hello, I am interested in',
} as const

export type StringKey = keyof typeof en

const dictionaries: Record<string, Record<StringKey, string>> = { en, fr, es }

/** The languages a site may be built in: English plus one of the others. */
export const SUPPORTED_LANGUAGES = Object.keys(dictionaries)

export function t(language: string, key: StringKey): string {
  return dictionaries[language]?.[key] ?? en[key]
}

/** A label's colon: French sets a narrow no-break space before it. */
export function colon(language: string): string {
  return language === 'fr' ? '\u202f:' : ':'
}

/** "1 day", "5 days", "1 night", "4 nights". */
export function countOf(language: string, n: number, unit: 'day' | 'night'): string {
  const key: StringKey = unit === 'day' ? (n === 1 ? 'oneDay' : 'days') : (n === 1 ? 'oneNight' : 'nights')
  return `${n} ${t(language, key)}`
}

/** The language's own name, for the language switcher. */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code)
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
