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
  priceOnRequest: 'Price on request',
  askForPrice: 'Ask us for a price for your dates.',
  total: 'Total',
  lowerForGroups: 'Lower per person for larger groups',
  fewerTravellers: 'One traveller fewer',
  moreTravellers: 'One more traveller',
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
  // ---- discovery (redesign) ----
  findJourney: 'Find your journey',
  anyLength: 'Any length',
  dayTrips: 'Day trips',
  shortBreaks: 'Up to 4 days',
  longJourneys: '5 days or more',
  anywhere: 'Anywhere',
  noMatch: 'No journey matches — try another filter.',
  destinationsTitle: 'Destinations',
  destinationLabel: 'Destination',
  toursThere: 'Journeys that go there',
  journeysCount: 'journeys',
  oneJourney: 'journey',
  // ---- step-by-step enquiry (redesign) ----
  stepWhen: 'When and who',
  stepTrip: 'Your trip',
  stepContact: 'Your details',
  next: 'Next',
  back: 'Back',
  step: 'Step',
  of: 'of',
  // ---- Google reviews (redesign) ----
  reviewsTitle: 'What travellers say',
  reviewsOnGoogle: 'reviews on Google',
  translatedByGoogle: 'Translated by Google',
  seeOriginal: 'See the original',
  onGoogleMaps: 'On Google Maps',
  reviewsNotVerified: 'Reviews are not verified by Google.',
  reviewsPolicy: 'How Google handles reviews',
  // ---- website template (brief 2026-10-28) ----
  breadcrumb: 'Breadcrumb',
  hours: 'hours',
  oneHour: 'hour',
  tourTypeLabel: 'Tour type',
  pickupLabel: 'Pickup',
  hotelPickupIn: 'Hotel pickup in',
  hotelPickup: 'Hotel pickup',
  noPickup: 'Meet at the start point',
  guideLabel: 'Guide',
  freeCancellationUpTo: 'Free cancellation up to',
  daysBefore: 'days before',
  viewAllPhotos: 'View all',
  photosWord: 'photos',
  pickupTitle: 'Pickup and meeting point',
  meetingPoint: 'Meeting point',
  approxTimes: 'Times are approximate.',
  faqTitle: 'Frequently asked questions',
  relatedTitle: 'You may also like',
  cancelFree: 'Free',
  cancelOnDay: 'On the day',
  trustNoPayment: 'No payment to enquire',
  trustLicensed: 'Licensed tour operator',
  optionLabel: 'Option',
  optionNote: 'The price includes everything listed under “What is included”.',
  travelDate: 'Travel date',
  bookingTerms: 'Booking terms',
  privacy: 'Privacy',
  cookieSettings: 'Cookie settings',
  cookieText: 'This website sets no cookies — no tracking and no advertising. What you send in a form goes only to us.',
  close: 'Close',
  websiteBy: 'Website by',
  browseTours: 'Browse tours',
  valueLine: 'one clear price per person for your group.',
  toursIn: 'Tours in',
  and: 'and',
  whyTitle: 'Why travel with us',
  whyOnePrice: 'One clear price',
  whyOnePriceText: 'The price per person for your group, shown up front.',
  whyLicensedText: 'Licence',
  whyNoPaymentText: 'Ask about any tour — there is nothing to pay to enquire.',
  howTitle: 'How booking works',
  how1: 'Choose a tour',
  how1Text: 'See the itinerary, what is included and the price for your group.',
  how2: 'Send an enquiry',
  how2Text: 'Tell us your dates and who is travelling.',
  how3: 'Confirm with us',
  how3Text: 'We check availability and send you everything you need to book.',
  ctaTitle: 'Ready to plan your trip?',
  ctaText: 'Tell us your dates and who is travelling — we reply with everything you need.',
  popularTours: 'Popular tours',
  allTypes: 'All',
  sortLabel: 'Sort by',
  sortRecommended: 'Recommended',
  sortPriceAsc: 'Price: lowest first',
  sortPriceDesc: 'Price: highest first',
  sortDuration: 'Duration: shortest first',
  prevPage: 'Previous',
  nextPage: 'Next',
  pageWord: 'Page',
  typeLabel: 'Type',
  aboutTitle: 'About us',
  aboutLicences: 'Licences and registration',
  registeredCompany: 'Registered company',
  licenceNumber: 'Licence number',
  addressLabel: 'Address',
  getInTouch: 'Get in touch',
  contactTitle: 'Contact us',
  sentTitle: 'Thank you — we have your enquiry',
  sentText: 'We will reply to the email address you gave us.',
  sendAnother: 'Send another enquiry',
  emailLabel: 'Email',
  phoneLabel: 'Phone',
  ourTours: 'Our tours',
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
