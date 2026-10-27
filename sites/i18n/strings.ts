// ============================================
// The site's own interface words (not the agency's content)
// ============================================
// Buttons, headings and labels the themes print. English only for now: the
// second language's words arrive with step 10, translated and reviewed
// (PLAN D14) — until then a French or Spanish page falls back to English for
// these, and to nothing invented.

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
} as const

export type StringKey = keyof typeof en

const dictionaries: Record<string, Partial<Record<StringKey, string>>> = { en }

export function t(language: string, key: StringKey): string {
  return dictionaries[language]?.[key] ?? en[key]
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
