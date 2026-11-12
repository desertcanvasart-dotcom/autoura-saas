// ============================================
// One guide price, for several cities and languages (migration 463)
// ============================================
// Operator, 2026-11-12: picking a guide and adding 3 or 4 cities saved the
// same price 3 or 4 times (one row per city × language, #803). A guide price
// is now ONE row: its first city and language in `city` / `guide_language`,
// the rest in `other_cities` / `other_languages`. The engine reads the lists
// (lib/guides/guide-language.ts: rateCities, rateLanguages).
//
// A blank city is the "any city" price, so it carries no other cities.
//
// Pure: the routes and the tests both call it.

export interface GuideRateLists {
  city: string | null
  other_cities: string[]
  guide_language: string
  other_languages: string[]
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The values in order, trimmed, blanks and repeats (any case) dropped. */
function uniqueList(values: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of values) {
    const s = clean(v)
    const k = s.toLowerCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * The cities and languages a form body asks for, as the row stores them.
 * Accepts the lists either as `cities` / `languages` (the form: every city,
 * every language) or as `city` + `other_cities`, `guide_language` +
 * `other_languages` (the row's own shape, the CSV).
 */
export function guideRateLists(body: {
  city?: unknown
  other_cities?: unknown
  cities?: unknown
  guide_language?: unknown
  other_languages?: unknown
  languages?: unknown
}): GuideRateLists {
  const cities = Array.isArray(body.cities)
    ? uniqueList(body.cities)
    : clean(body.city) ? uniqueList([body.city, ...asArray(body.other_cities)]) : []
  const languages = Array.isArray(body.languages)
    ? uniqueList(body.languages)
    : uniqueList([body.guide_language, ...asArray(body.other_languages)])
  return {
    city: cities[0] ?? null,
    other_cities: cities.slice(1),
    guide_language: languages[0] ?? '',
    other_languages: languages.slice(1),
  }
}

/** Does the body say anything about the cities / languages (a PUT may not)? */
export const touchesCities = (b: Record<string, unknown>) => 'cities' in b || 'city' in b || 'other_cities' in b
export const touchesLanguages = (b: Record<string, unknown>) => 'languages' in b || 'guide_language' in b || 'other_languages' in b
