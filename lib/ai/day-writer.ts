// ============================================
// Writing a trip's days from the Content Library
// ============================================
// The Quote Builder's "Write descriptions". Each day is described from what
// the day actually SELLS — the sites, hotel, cruise and experiences picked in
// its slots — and the agency's own Content Library text for those things, in
// the agency's house style (Writing Rules, Phrases). Matching is done here,
// without AI, so the text can only be grounded in entries that really match
// a pick; the AI then writes from those facts and nothing else.
//
// Pure: the route (app/api/pricing-grid/write-days) and the tests share it.

import type { GridDay } from '@/app/pricing-grid/types'

// ---------- the library, as the route loads it ----------

export interface LibraryVariation {
  tier: string
  title: string | null
  description: string | null
  highlights: string[] | null
  /** Cruises: [{ day, title, description }] for each sailing day. */
  day_by_day?: unknown
}

export interface LibraryEntry {
  id: string
  name: string
  /** content_categories.slug: sites-attractions, hotels-accommodations, … */
  category: string
  location: string | null
  short_description: string | null
  variations: LibraryVariation[]
}

export interface WritingRuleRow {
  name: string
  description: string
  rule_type: string | null
  priority: number | null
  applies_to: string[] | null
  applies_to_tiers: string[] | null
  /** Older rules: good examples as a plain list. */
  examples: string[] | null
  /** The Writing Rules page saves { good: [...], bad: [...] } here. */
  examples_json?: unknown
}

function ruleExamples(r: WritingRuleRow): { good: string[]; bad: string[] } {
  const j = (r.examples_json ?? null) as { good?: unknown; bad?: unknown } | null
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map(x => x.trim()).filter(Boolean) : [])
  return { good: [...list(j?.good), ...list(r.examples)].slice(0, 2), bad: list(j?.bad).slice(0, 2) }
}

// ---------- what a day sells ----------

export type FactKind = 'site' | 'hotel' | 'cruise' | 'experience'

export interface DayFacts {
  dayNumber: number
  city: string
  sites: string[]
  hotel: string | null
  cruise: string | null
  experiences: string[]
  meals: string[]
  transport: string[]
  flights: string[]
  airportServices: boolean
}

const names = (day: GridDay, slotId: string) =>
  (day.slots.find(s => s.slotId === slotId)?.selectedItems ?? [])
    .filter(i => !i.rateId.endsWith('_supp'))
    .map(i => String(i.name ?? '').trim())
    .filter(Boolean)

export function dayFacts(day: GridDay): DayFacts {
  return {
    dayNumber: day.dayNumber,
    city: String(day.city ?? '').trim(),
    sites: names(day, 'entrance_fees'),
    hotel: names(day, 'accommodation')[0] ?? null,
    cruise: names(day, 'cruise')[0] ?? null,
    experiences: [...names(day, 'experiences'), ...names(day, 'boat_rides')],
    meals: names(day, 'meals'),
    transport: names(day, 'route'),
    flights: names(day, 'flights'),
    airportServices: names(day, 'airport_services').length > 0,
  }
}

// ---------- matching a pick to an entry ----------

const CATEGORY_OF: Record<FactKind, string> = {
  site: 'sites-attractions',
  hotel: 'hotels-accommodations',
  cruise: 'cruises',
  experience: 'experiences-activities',
}

const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'at', 'in', 'to', 'el', 'al', 'de', 'la', 'le'])
// Words that say what KIND of place something is, not which one: "Temple"
// alone must not match "Karnak Temple Complex".
const GENERIC = new Set([
  'temple', 'temples', 'complex', 'museum', 'tomb', 'tombs', 'valley', 'hotel', 'resort', 'palace', 'mosque',
  'church', 'cruise', 'ship', 'ms', 'nile', 'tour', 'visit', 'park', 'garden', 'gardens', 'market', 'bazaar',
  'pyramid', 'pyramids', 'island', 'old', 'new', 'grand', 'royal', 'city', 'site', 'sites',
])

/** "Karnak Temple (Standard) - Luxor" → ["karnak", "temple"]: the name only,
 *  without a tier in brackets or a place after a dash. */
export function nameTokens(raw: string): string[] {
  const base = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s[-–—|]\s/)[0]
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
  return base.split(/\s+/).filter(t => t.length > 1 && !STOP.has(t))
}

/** Does library entry `entryName` name the same thing as pick `pick`? */
export function sameThing(pick: string, entryName: string): boolean {
  const a = nameTokens(pick)
  const b = nameTokens(entryName)
  if (a.length === 0 || b.length === 0) return false
  const sa = a.join(' ')
  const sb = b.join(' ')
  if (sa === sb) return true
  // One name inside the other ("Karnak" ⊂ "Karnak Temple Complex"), when the
  // shorter is a real name and not a lone common word.
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa]
  const distinctive = (t: string[]) => t.some(x => !GENERIC.has(x))
  if (!distinctive(a) || !distinctive(b)) return false
  const shortTokens = short.split(' ')
  if (short.length >= 5 && distinctive(shortTokens) && ` ${long} `.includes(` ${short} `)) return true
  // Enough shared words, at least one of them a name rather than a kind.
  const setB = new Set(b)
  const shared = a.filter(t => setB.has(t))
  return distinctive(shared) && shared.length / Math.max(a.length, b.length) >= 0.6
}

export interface UsedEntry {
  id: string
  name: string
  kind: FactKind | 'day'
  /** The tier the text came from; differs from the trip's when the trip's
   *  own tier had none (flagged). */
  tier: string | null
  otherTier: boolean
  title: string
  text: string
  highlights: string[]
}

/** The entry's text for `tier`, else another tier's (flagged), else its
 *  short description. */
export function textForTier(entry: LibraryEntry, tier: string): Omit<UsedEntry, 'id' | 'name' | 'kind'> | null {
  const usable = entry.variations.filter(v => String(v.description ?? '').trim())
  const own = usable.find(v => v.tier === tier)
  const pick = own ?? usable.find(v => v.tier === 'standard') ?? usable[0]
  if (pick) {
    return {
      tier: pick.tier,
      otherTier: !own,
      title: String(pick.title ?? entry.name),
      text: String(pick.description ?? '').trim(),
      highlights: (pick.highlights ?? []).filter(Boolean).slice(0, 6),
    }
  }
  const short = String(entry.short_description ?? '').trim()
  return short ? { tier: null, otherTier: false, title: entry.name, text: short, highlights: [] } : null
}

export interface DayMatch {
  facts: DayFacts
  used: UsedEntry[]
  /** Picks the library has nothing for — the team's to-do list. */
  missing: Array<{ kind: FactKind; name: string }>
  /** Cruises: the sailing day's own text, when the library has a day-by-day. */
  cruiseDay: { title: string; description: string } | null
}

function cruiseDayText(entry: LibraryEntry, tier: string, index: number): { title: string; description: string } | null {
  const v = entry.variations.find(x => x.tier === tier && Array.isArray(x.day_by_day))
    ?? entry.variations.find(x => Array.isArray(x.day_by_day))
  const list = (v?.day_by_day ?? []) as Array<{ day?: number; title?: string; description?: string }>
  const d = list.find(x => Number(x?.day) === index + 1) ?? list[index]
  return d && (d.description || d.title) ? { title: String(d.title ?? ''), description: String(d.description ?? '') } : null
}

/**
 * Match every day of the trip to the library.
 * `cruiseIndex` of a day = how many cruise days came before it, so a 4-night
 * sailing reads its own day 1, 2, 3 … from the cruise's day-by-day.
 */
export function matchTrip(days: GridDay[], library: LibraryEntry[], tier: string): DayMatch[] {
  const byCategory = new Map<string, LibraryEntry[]>()
  for (const e of library) {
    const list = byCategory.get(e.category) ?? []
    list.push(e)
    byCategory.set(e.category, list)
  }
  const find = (kind: FactKind, name: string) =>
    (byCategory.get(CATEGORY_OF[kind]) ?? []).find(e => sameThing(name, e.name)) ?? null

  let cruiseDaysSoFar = 0
  return [...days].sort((a, b) => a.dayNumber - b.dayNumber).map(day => {
    const facts = dayFacts(day)
    const used: UsedEntry[] = []
    const missing: DayMatch['missing'] = []
    const take = (kind: FactKind, name: string): LibraryEntry | null => {
      const entry = find(kind, name)
      const text = entry ? textForTier(entry, tier) : null
      if (!entry || !text) {
        missing.push({ kind, name })
        return null
      }
      if (!used.some(u => u.id === entry.id)) used.push({ id: entry.id, name: entry.name, kind, ...text })
      return entry
    }

    for (const s of facts.sites) take('site', s)
    for (const x of facts.experiences) take('experience', x)
    if (facts.hotel) take('hotel', facts.hotel)
    let cruiseDay: DayMatch['cruiseDay'] = null
    if (facts.cruise) {
      const entry = take('cruise', facts.cruise)
      if (entry) cruiseDay = cruiseDayText(entry, tier, cruiseDaysSoFar)
      cruiseDaysSoFar++
    }

    // A day structure for the day's city, as a model of how such a day reads.
    const structure = facts.city
      ? (byCategory.get('day-structures') ?? []).find(e =>
          sameThing(facts.city, e.location ?? '') || sameThing(facts.city, e.name))
      : null
    const structureText = structure ? textForTier(structure, tier) : null
    if (structure && structureText) used.push({ id: structure.id, name: structure.name, kind: 'day', ...structureText })

    return { facts, used, missing, cruiseDay }
  })
}

// ---------- the house style ----------

/** The rules that apply to itinerary text at this tier, strongest first. */
export function itineraryRules(rules: WritingRuleRow[], tier: string): WritingRuleRow[] {
  return rules
    .filter(r => {
      const to = r.applies_to?.length ? r.applies_to : ['all']
      return to.includes('all') || to.includes('itinerary')
    })
    .filter(r => !r.applies_to_tiers?.length || r.applies_to_tiers.includes(tier))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

export function styleBlock(rules: WritingRuleRow[], phrases: string[]): string {
  const group = (type: string, label: string) => {
    const list = rules.filter(r => (r.rule_type ?? 'prefer') === type).slice(0, 12)
    if (!list.length) return ''
    return `${label}:\n` + list.map(r => {
      const ex = ruleExamples(r)
      const good = ex.good.length ? ` Write like: ${ex.good.map(e => `"${e}"`).join('; ')}.` : ''
      const bad = ex.bad.length ? ` Not like: ${ex.bad.map(e => `"${e}"`).join('; ')}.` : ''
      return `- ${r.name}: ${r.description}${good}${bad}`
    }).join('\n')
  }
  const parts = [
    group('enforce', 'MUST follow'),
    group('prefer', 'PREFER'),
    group('avoid', 'AVOID'),
    phrases.length ? `The agency's own phrases, to use where they fit:\n${phrases.slice(0, 20).map(p => `- ${p}`).join('\n')}` : '',
  ].filter(Boolean)
  return parts.length ? `HOUSE STYLE\n${parts.join('\n\n')}` : 'HOUSE STYLE\n(none set — write in a warm, clear, professional voice)'
}

// ---------- the request ----------

export const WRITER_SYSTEM = `You write the day-by-day text of a travel itinerary that a client will read.

For each day you are given what the day includes (its facts) and the agency's own library text for those things. Write a short title and a description for that day.

Rules:
- Use only the day's facts and its library text. Do not add sites, meals, hotels, activities, times or details that are not given for that day.
- Never mention prices, costs, currencies or rates.
- Library text is the agency's own writing: draw on it closely, in the house style, rather than replacing it with general knowledge.
- Title: under 70 characters. Description: 2 to 5 sentences, under 900 characters, plain text with no markdown.
- Follow the house style. MUST rules always apply; AVOID rules are never broken.
- Match the trip's tier in tone (a luxury trip reads differently from a budget one) without overstating what is included.`

export function writerPrompt(input: {
  tourName: string | null
  tier: string
  pax: number
  matches: DayMatch[]
}): string {
  const days = input.matches.map(m => ({
    day: m.facts.dayNumber,
    city: m.facts.city || null,
    includes: {
      sites: m.facts.sites,
      hotel: m.facts.hotel,
      nile_cruise: m.facts.cruise,
      experiences: m.facts.experiences,
      meals: m.facts.meals,
      transport: m.facts.transport,
      flights: m.facts.flights,
      airport_assistance: m.facts.airportServices || undefined,
    },
    library: m.used.map(u => ({
      about: u.name,
      kind: u.kind === 'day' ? 'how a day here is usually described' : u.kind,
      title: u.title,
      text: u.text.slice(0, 1500),
      highlights: u.highlights.length ? u.highlights : undefined,
    })),
    cruise_day: m.cruiseDay ?? undefined,
  }))
  return [
    `TRIP: ${input.tourName || 'Untitled trip'} — ${input.tier} tier, ${input.pax} traveller${input.pax === 1 ? '' : 's'}`,
    `DAYS TO WRITE (JSON):\n${JSON.stringify(days, null, 1)}`,
    'Write every day listed, using its "day" number.',
  ].join('\n\n')
}

export function writerSchema(dayNumbers: number[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['days'],
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['day', 'title', 'description'],
          properties: {
            day: { type: 'integer', enum: dayNumbers },
            title: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    },
  } as const
}

// ---------- what comes back ----------

// Any currency sign (the Unicode currency category) next to a number, or a
// currency code next to one.
const MONEY = /\p{Sc}\s?\d|\d\s?(?:\p{Sc}|eur\b|usd\b|gbp\b|egp\b|le\b)|\b(?:eur|usd|gbp|egp)\s?\d/iu

export interface WrittenDay {
  dayNumber: number
  title: string
  description: string
}

/** The reply, held to the rules: only the days asked for, trimmed to size,
 *  and never a sentence with a price in it. */
export function acceptWritten(reply: unknown, asked: number[]): WrittenDay[] {
  const list = (reply as { days?: unknown })?.days
  if (!Array.isArray(list)) return []
  const want = new Set(asked)
  const seen = new Set<number>()
  const out: WrittenDay[] = []
  for (const d of list as Array<Record<string, unknown>>) {
    const n = Number(d?.day)
    if (!want.has(n) || seen.has(n)) continue
    const title = String(d?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
    const description = String(d?.description ?? '')
      .split(/(?<=[.!?])\s+/)
      .filter(s => !MONEY.test(s))
      .join(' ')
      .replace(/[*_#`]+/g, '')
      .trim()
      .slice(0, 1200)
    if (!description) continue
    seen.add(n)
    out.push({ dayNumber: n, title, description })
  }
  return out
}

/** A title the operator has not really chosen: empty, "Day 3", or just the city. */
export function isPlaceholderTitle(title: string, dayNumber: number, city: string): boolean {
  const t = String(title ?? '').trim().toLowerCase()
  return !t || t === `day ${dayNumber}` || /^day \d+$/.test(t) || (!!city && t === city.trim().toLowerCase())
}
