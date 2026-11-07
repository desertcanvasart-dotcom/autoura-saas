// ============================================
// One guide price, saved for several cities and languages
// ============================================
// Operator, 2026-11-07: a guide (or a throughout guide) works many cities and
// speaks several languages. A guide_rates row stays ONE city × ONE language —
// that is what the engine matches a day against (lib/guides/guide-language.ts)
// and what lets one language or city be repriced later on its own. The Add
// form instead lets the operator tick extra cities/languages, and the API
// saves one row per pair. A blank city is "any city" — the row the engine
// falls back to on a day whose city has no row of its own.
//
// Pure: the route and the tests both call it.

export interface GuideRateCombo { city: string | null; guide_language: string }

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Every city × language the body asks for, the primary pair first, no repeats. */
export function guideRateCombos(body: {
  city?: unknown
  guide_language?: unknown
  also_cities?: unknown
  also_languages?: unknown
}): GuideRateCombo[] {
  const list = (first: unknown, more: unknown): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const v of [first, ...(Array.isArray(more) ? more : [])]) {
      const s = clean(v)
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
    }
    return out
  }
  const cities = list(body.city, body.also_cities)
  const languages = list(body.guide_language, body.also_languages).filter(Boolean)
  const combos: GuideRateCombo[] = []
  for (const language of languages) {
    for (const city of cities) combos.push({ city: city || null, guide_language: language })
  }
  return combos
}

/** The service code for the i-th row: the form's own code first, then -2, -3… */
export function comboServiceCode(base: string, index: number): string {
  return index === 0 ? base : `${base}-${index + 1}`
}

/** A cap so a slip of the mouse cannot write hundreds of rows. */
export const MAX_GUIDE_RATE_COMBOS = 60
