// ============================================
// One guide language for the whole trip
// ============================================
// A trip's guide picks were made day by day — by the AI reading the text,
// and by the day blocks, which took the first guide listed for the day's city
// — and nothing held them to one language: the same itinerary came out with
// a Spanish guide on some days and an English guide on others (operator,
// 2026-10-10). The grid now carries the trip's guide language (GridConfig.
// guideLanguage): set in the header, or taken from the guides most days
// already have. Every pick follows it, and changing it moves each day's guide
// to the same kind of guide in the same city, in that language.
//
// Pure: page.tsx, grid-apply.ts and the tests share it.

import type { GridDay, RateOption, SelectedItem } from '../types'

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/** The languages the agency has guides in, A→Z. */
export function guideLanguages(guides: RateOption[]): string[] {
  return [...new Set(guides.map(g => String(g.language ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

const guideItem = (day: GridDay): SelectedItem | undefined =>
  day.slots.find(s => s.slotId === 'guide')?.selectedItems[0]

/** The language most of the trip's guides speak (the first-seen on a tie), or null. */
export function majorityGuideLanguage(days: GridDay[], guides: RateOption[]): string | null {
  const byId = new Map(guides.map(g => [g.id, g]))
  const counts = new Map<string, number>()
  for (const day of days) {
    const lang = byId.get(guideItem(day)?.rateId ?? '')?.language
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [lang, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = lang
  return best
}

/** Of `pool`, the guides in `language` first — the whole pool when none is. */
export function preferLanguage(pool: RateOption[], language: string | null | undefined): RateOption[] {
  if (!language) return pool
  const inLang = pool.filter(g => norm(g.language) === norm(language))
  return inLang.length ? inLang : pool
}

/** The guide in `language` that stands in for `current`: same city and kind,
 *  else same city. Null when the city has no guide in that language. */
export function counterpart(current: RateOption, language: string, guides: RateOption[]): RateOption | null {
  const sameCity = (g: RateOption) => norm(g.city) === norm(current.city)
  const inLang = guides.filter(g => norm(g.language) === norm(language) && sameCity(g))
  return inLang.find(g => norm(g.category) === norm(current.category)) ?? inLang[0] ?? null
}

export interface LanguageAlignment {
  days: GridDay[]
  /** Days whose guide moved to the language. */
  changed: number[]
  /** Days whose city has no guide in the language: left as they were. */
  unmatched: number[]
}

/** Every day's guide in `language`. A guide not in the rate list (a custom
 *  line) or already in the language is left alone. */
export function alignGuideLanguage(days: GridDay[], guides: RateOption[], language: string): LanguageAlignment {
  const byId = new Map(guides.map(g => [g.id, g]))
  const changed: number[] = []
  const unmatched: number[] = []
  const next = days.map(day => {
    const item = guideItem(day)
    const current = item ? byId.get(item.rateId) : undefined
    if (!current || !current.language || norm(current.language) === norm(language)) return day
    const swap = counterpart(current, language, guides)
    if (!swap) {
      unmatched.push(day.dayNumber)
      return day
    }
    changed.push(day.dayNumber)
    const replacement: SelectedItem = {
      rateId: swap.id,
      name: swap.name,
      rateEur: swap.rateEur,
      rateNonEur: swap.rateNonEur,
      ...(swap.pricing_basis ? { pricingBasis: swap.pricing_basis, unitCapacity: swap.unit_capacity ?? null } : {}),
    }
    return {
      ...day,
      slots: day.slots.map(s => (s.slotId === 'guide' ? { ...s, selectedItems: [replacement], customAmount: 0 } : s)),
    }
  })
  return { days: changed.length ? next : days, changed, unmatched }
}
