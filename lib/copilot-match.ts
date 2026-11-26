// ============================================
// Copilot — which tours an enquiry is about, for which date and party
// ============================================
// The RATES block (lib/copilot-rates.ts) lists the tours an enquiry concerns.
// This finds them:
//
//   1. Names first — the company's active tours, by name, code and publish
//      slug, against the subject, body and (for a website form) page URL:
//      an exact phrase, else most of a name's significant words.
//   2. Only when that finds nothing: ONE small model call, given the tour
//      names, returns up to three ids — plus the travel date and party size
//      when the heuristics below did not find them. It counts against the
//      company's AI ceiling (lib/rate-limit-shared 'aiCompany'); over the
//      ceiling it is simply not made.
//
// At most three tours, so the RATES block stays short. The travel date and
// party size are optional: a heuristic reads them from the text, the model
// fills a gap when it is asked anyway.

import { createMessageWithRetry, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export const MAX_MATCHED_TOURS = 3
/** Tours offered to the model by name — enough for any real catalogue. */
const MAX_TOURS_FOR_MODEL = 300

export interface TourCandidate {
  id: string
  name: string
  code?: string | null
  slugs: string[]
}

export interface EnquiryMatch {
  templateIds: string[]
  travelDate: string | null
  pax: number | null
  /** Whether the model was asked (counted against the AI ceiling). */
  usedModel: boolean
}

// ---------- text helpers ----------

export function normalise(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Words that say nothing about WHICH tour. */
const FILLER = new Set([
  'tour', 'tours', 'day', 'days', 'private', 'trip', 'the', 'and', 'of', 'to', 'in', 'a', 'an', 'with', 'from',
  'egypt', 'excursion', 'full', 'half', 'visit', 'package', 'night', 'nights', 'for', 'by', 'at', 'on',
])

function significantWords(name: string): string[] {
  return normalise(name).split(' ').filter(w => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w))
}

/** "pyramid" and "pyramids" are one word here; short words must match exactly. */
function wordPresent(word: string, textWords: Set<string>): boolean {
  if (textWords.has(word)) return true
  if (word.length < 5) return false
  const stem = word.slice(0, Math.max(5, word.length - 2))
  for (const t of textWords) if (t.length >= 5 && t.startsWith(stem)) return true
  return false
}

/**
 * Score a tour against the enquiry: 1 for an exact name, code or slug, else
 * the share of its significant words present (at least two of them).
 */
export function scoreTour(tour: TourCandidate, text: string, pageUrl?: string | null): number {
  const norm = ` ${normalise(text)} `
  const url = (pageUrl ?? '').toLowerCase()
  const name = normalise(tour.name)
  if (name && norm.includes(` ${name} `)) return 1
  if (tour.code && norm.includes(` ${normalise(tour.code)} `)) return 1
  for (const slug of tour.slugs) {
    if (!slug) continue
    if (url && url.includes(slug.toLowerCase())) return 1
    const s = normalise(slug)
    if (s.split(' ').length >= 2 && norm.includes(` ${s} `)) return 1
  }
  const words = significantWords(tour.name)
  if (words.length < 2) return 0
  const textWords = new Set(norm.trim().split(' '))
  const hits = words.filter(w => wordPresent(w, textWords)).length
  return hits >= 2 ? hits / words.length : 0
}

/** The best name matches — at most three, a fuzzy match needing 75% of the words. */
export function matchByName(tours: TourCandidate[], text: string, pageUrl?: string | null): string[] {
  return tours
    .map(t => ({ id: t.id, score: scoreTour(t, text, pageUrl) }))
    .filter(s => s.score >= 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_TOURS)
    .map(s => s.id)
}

// ---------- party size and date ----------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2,
}
const num = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] ?? null)
const NUM = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'

/** The party size an enquiry states, or null. Sanity range 1–40. */
export function extractPax(text: string): number | null {
  const t = normalise(text)
  const ok = (n: number | null) => (n !== null && n >= 1 && n <= 40 ? n : null)

  // "2 adults and 2 children", "two adults, one child"
  const adults = new RegExp(`\\b${NUM} adults?\\b`).exec(t)
  if (adults) {
    const kids = new RegExp(`\\b${NUM} (children|child|kids|kid|teenagers?|infants?)\\b`).exec(t)
    const a = num(adults[1]), k = kids ? num(kids[1]) : 0
    if (a !== null && k !== null) return ok(a + k)
  }
  const N = NUM.replace('(', '(?<n>')
  const patterns = [
    new RegExp(`\\b(?:family|group|party) of ${N}\\b`),
    new RegExp(`\\b${N} (?:people|persons|person|pax|travell?ers|guests|participants)\\b`),
    new RegExp(`\\bwe are ${N}\\b`),
    new RegExp(`\\b${N} of us\\b`),
  ]
  for (const p of patterns) {
    const m = p.exec(t)
    if (m?.groups?.n) return ok(num(m.groups.n))
  }
  if (/\b(a couple|my (wife|husband|partner) and i|the two of us)\b/.test(t)) return 2
  return null
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}
const MONTHS = Object.keys(MONTH_INDEX).sort((a, b) => b.length - a.length).join('|')

function iso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

/** With no year: the next such day on or after today. */
function nextOccurrence(m: number, d: number, today: Date): string | null {
  const y = today.getUTCFullYear()
  const todayIso = today.toISOString().slice(0, 10)
  const thisYear = iso(y, m, d)
  if (thisYear && thisYear >= todayIso) return thisYear
  return iso(y + 1, m, d)
}

/** The first travel date an enquiry states (YYYY-MM-DD), or null. */
export function extractTravelDate(text: string, today: Date = new Date()): string | null {
  const t = text.toLowerCase()
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  // Day first — the usual order in mail to Egypt: 13/03/2027, 13.3.27
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|20\d{2})\b/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return iso(y, Number(m[2]), Number(m[1]))
  }
  // 13 March (2027), 13th of March
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${MONTHS})\\.?(?:,? (20\\d{2}))?\\b`).exec(t)
  if (m) {
    const month = MONTH_INDEX[m[2]], day = Number(m[1])
    return m[3] ? iso(Number(m[3]), month, day) : nextOccurrence(month, day, today)
  }
  // March 13(th)(, 2027)
  m = new RegExp(`\\b(${MONTHS})\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? (20\\d{2}))?`).exec(t)
  if (m) {
    const month = MONTH_INDEX[m[1]], day = Number(m[2])
    return m[3] ? iso(Number(m[3]), month, day) : nextOccurrence(month, day, today)
  }
  return null
}

// ---------- the catalogue ----------

export async function loadTourCandidates(db: Db, tenantId: string): Promise<TourCandidate[]> {
  const [{ data: templates, error }, { data: pages }] = await Promise.all([
    db.from('tour_templates').select('id, template_name, template_code, is_active').eq('tenant_id', tenantId),
    db.from('publish_pages').select('tour_template_id, publish_page_locales(slug)').eq('tenant_id', tenantId),
  ])
  if (error) throw new Error(`reading the tours: ${error.message}`)
  const slugs = new Map<string, string[]>()
  for (const p of (pages ?? []) as Array<{ tour_template_id: string | null; publish_page_locales?: Array<{ slug: string }> | null }>) {
    if (!p.tour_template_id) continue
    const list = slugs.get(p.tour_template_id) ?? []
    for (const l of p.publish_page_locales ?? []) if (l?.slug) list.push(l.slug)
    slugs.set(p.tour_template_id, list)
  }
  return ((templates ?? []) as Array<{ id: string; template_name: string; template_code: string | null; is_active: boolean | null }>)
    .filter(t => t.is_active !== false && t.template_name)
    .map(t => ({ id: t.id, name: t.template_name, code: t.template_code, slugs: slugs.get(t.id) ?? [] }))
}

// ---------- the model pass ----------

type AskModel = (system: string, user: string) => Promise<string>

const defaultAsk: AskModel = async (system, user) => {
  const resp = await createMessageWithRetry({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return replyText(resp)
}

const MATCH_PROMPT = `You match a travel enquiry to a tour operator's catalogue.
Return JSON only: {"templateIds": ["<id>", ...], "travelDate": "YYYY-MM-DD" | null, "pax": <number> | null}
- templateIds: up to 3 ids from the catalogue the enquiry is plausibly about, best first; [] when none fits. Use only ids from the list.
- travelDate: the first travel date the enquiry states, else null. Never guess a year the text does not imply; assume the next such date.
- pax: the total number of travellers including children, else null.`

/** The model's answer, or null when it cannot be read. Exported for tests. */
export function readMatchAnswer(text: string, validIds: ReadonlySet<string>): { templateIds: string[]; travelDate: string | null; pax: number | null } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { templateIds?: unknown; travelDate?: unknown; pax?: unknown }
    const ids = Array.isArray(j.templateIds) ? j.templateIds.filter((x): x is string => typeof x === 'string' && validIds.has(x)) : []
    const date = typeof j.travelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.travelDate) && iso(...(j.travelDate.split('-').map(Number) as [number, number, number]))
      ? j.travelDate : null
    const pax = typeof j.pax === 'number' && Number.isInteger(j.pax) && j.pax >= 1 && j.pax <= 40 ? j.pax : null
    return { templateIds: [...new Set(ids)].slice(0, MAX_MATCHED_TOURS), travelDate: date, pax }
  } catch {
    return null
  }
}

// ---------- entry points ----------

export async function matchEnquiry(db: Db, input: {
  tenantId: string
  text: string
  pageUrl?: string | null
  today?: Date
  /** Injected in tests. */
  ask?: AskModel
  /** Injected in tests; the company AI ceiling otherwise. */
  allowModel?: (tenantId: string) => Promise<boolean>
}): Promise<EnquiryMatch> {
  const text = String(input.text ?? '').slice(0, 8000)
  let travelDate = extractTravelDate(text, input.today)
  let pax = extractPax(text)
  const tours = await loadTourCandidates(db, input.tenantId)
  let templateIds = matchByName(tours, text, input.pageUrl)
  let usedModel = false

  if (!templateIds.length && tours.length && text.trim()) {
    const allow = input.allowModel ?? (async (t: string) => (await checkSharedRateLimit(t, 'aiCompany')).success)
    if (await allow(input.tenantId)) {
      usedModel = true
      try {
        const catalogue = tours.slice(0, MAX_TOURS_FOR_MODEL).map(t => `${t.id} | ${t.name}`).join('\n')
        const today = (input.today ?? new Date()).toISOString().slice(0, 10)
        const answer = readMatchAnswer(
          await (input.ask ?? defaultAsk)(MATCH_PROMPT, `Today: ${today}\n\nCatalogue (id | name):\n${catalogue}\n\nEnquiry:\n${text}${input.pageUrl ? `\n\nSent from page: ${input.pageUrl}` : ''}`),
          new Set(tours.map(t => t.id)),
        )
        if (answer) {
          templateIds = answer.templateIds
          travelDate = travelDate ?? answer.travelDate
          pax = pax ?? answer.pax
        }
      } catch (err) {
        console.error('[copilot-match] model match failed:', err instanceof Error ? err.message : err)
      }
    }
  }
  return { templateIds: templateIds.slice(0, MAX_MATCHED_TOURS), travelDate, pax, usedModel }
}

/** The tours an enquiry concerns — at most three ids. */
export async function matchTemplates(db: Db, input: { tenantId: string; text: string; pageUrl?: string | null }): Promise<string[]> {
  return (await matchEnquiry(db, input)).templateIds
}
