// ============================================
// Which guide rate row a day is priced from (sibling #459)
// ============================================
// The engine matched the language with `ilike` — a substring match where `_`
// is a wildcard — and then took the CHEAPEST of whatever matched, `limit(1)`.
// On production every agency has a guide rate PER CITY (twelve English
// egyptologist rows for Sawa Tours: Cairo, Luxor, Aswan, Alexandria, Fayoum…)
// and the engine ignored the city and priced every day at the first row.
// They all carry the same price today, so nothing was mispriced yet.
//
// THE RULE
//   - the language is matched EXACTLY: the row's value, whether it is the
//     vocabulary key ('english') or a word an older row stored ('English'),
//     resolves to the same key as the request — never a substring;
//   - a day is priced from the row for ITS city; with none, the row that
//     names no city (the agency's all-cities rate);
//   - several rows for the same place at the SAME price are one rate; at
//     DIFFERENT prices they are a gap naming them — the engine never takes
//     the cheapest.
//
// Pure and import-free (the calculator's picker reads it).

export interface GuideRateRow {
  id: string
  guide_language?: string | null
  city?: string | null
  full_day_rate?: number | string | null
  base_rate_eur?: number | string | null
}

export interface LanguageItem { key: string; label: string }

const slug = (v: unknown): string => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** The vocabulary key a request or a stored value means: the key itself, a
 *  label, or the slug of either; a word the vocabulary does not know is its
 *  own slug (so two spellings of an unlisted language still match). */
export function guideLanguageKey(value: unknown, items: readonly LanguageItem[]): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase(), s = slug(raw)
  const hit = items.find(i => i.key === raw) ?? items.find(i => i.label.toLowerCase() === lower) ?? items.find(i => i.key === s) ?? items.find(i => slug(i.label) === s)
  return hit?.key ?? s
}

export const rateOf = (r: GuideRateRow): number => {
  const v = r.full_day_rate ?? r.base_rate_eur
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

export type GuideRatePick =
  | { kind: 'none' }
  | { kind: 'one'; row: GuideRateRow; rate: number; cityMatched: boolean }
  | { kind: 'ambiguous'; count: number; rates: number[]; where: string }

/** The row for a day in `city`, among rows already narrowed to the language,
 *  grade and duration. */
/** Giza is Cairo's guide, as it is Cairo's station (lib/pricing/ticket-legs). */
const GUIDE_CITY_ALIASES: Record<string, string> = { giza: 'cairo' }
const cityKey = (v: unknown): string => { const c = String(v ?? '').trim().toLowerCase(); return GUIDE_CITY_ALIASES[c] ?? c }

export function pickGuideRateRow(rows: readonly GuideRateRow[], city: string | null | undefined): GuideRatePick {
  const here = cityKey(city)
  const priced = rows.filter(r => rateOf(r) > 0)
  const inCity = here ? priced.filter(r => cityKey(r.city) === here) : []
  const pool = inCity.length > 0 ? inCity : priced.filter(r => !String(r.city ?? '').trim())
  if (pool.length === 0) return { kind: 'none' }
  const rates = [...new Set(pool.map(rateOf))]
  if (rates.length === 1) return { kind: 'one', row: pool[0], rate: rates[0], cityMatched: inCity.length > 0 }
  return { kind: 'ambiguous', count: pool.length, rates: rates.sort((a, b) => a - b), where: inCity.length > 0 ? `in ${String(city).trim()}` : 'with no city' }
}

/** The languages of the vocabulary, each with whether the agency has a rate
 *  for it — for the calculator's picker. */
export function languagesWithRates(items: readonly LanguageItem[], rows: readonly GuideRateRow[]): Array<LanguageItem & { hasRate: boolean }> {
  const keysWithRate = new Set(rows.filter(r => rateOf(r) > 0).map(r => guideLanguageKey(r.guide_language, items)))
  return items.map(i => ({ ...i, hasRate: keysWithRate.has(i.key) }))
}
