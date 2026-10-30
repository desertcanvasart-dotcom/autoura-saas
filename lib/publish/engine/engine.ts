// ============================================
// Publish — the content engine: language around the facts, never the facts
// ============================================
// docs/publish/PLAN.md §9 (D3: TypeScript, inside the GetAutoura app, behind
// this interface so it can move to its own service later).
//
//   draftNarrative(input, callModel) → a draft for review
//
// What the model is given: the tour's shape from the records (days, cities,
// sights, meals, where it sleeps), the agency's tone, words to avoid and
// claims it may make, its own source notes, the glossary, and the fact
// SLOTS it may place. What it is NOT given: prices, durations, group sizes,
// dates, terms — those exist only as slots, filled by the renderer.
//
// Every reply is held to the post-check (fact-check.ts). A draft that breaks
// it is sent back once or twice with the exact words to remove; after that
// it is kept as `failed_check` for a person to fix — never passed as clean.
// Engine output is always a DRAFT: publishing needs a person's approval
// (step 7), except the fact-only rule, which concerns facts, not this text.

import type Anthropic from '@anthropic-ai/sdk'
import type { TourFacts } from '../contract'
import { checkSegments, describeViolations, SUPPORTED_LANGUAGES, type CheckResult, type Segment } from './fact-check'
import { SLOT_KEYS, SLOT_MEANING, availableSlots, namesFromFacts, type SlotKey } from './slots'

export const PROMPT_VERSION = 'publish-narrative-v1'
export const MAX_ATTEMPTS = 3

export type DraftKind = 'overview' | 'highlights' | 'days' | 'seo'

export interface SourceNote { id: string; title: string; text: string }
export interface GlossaryEntry { term: string; spelling: string }
export interface EngineBrand { tone: string; claims: string[]; avoid: string[] }

export interface DraftInput {
  kind: DraftKind
  language: string
  tourName: string
  companyName: string
  facts: TourFacts
  brand: EngineBrand
  sources: SourceNote[]
  glossary: GlossaryEntry[]
  /** A reviewer's note on a rejected draft — the next draft's instruction. */
  instruction?: string | null
}

export type EngineContent =
  | { kind: 'overview'; segments: Segment[] }
  | { kind: 'highlights'; items: Segment[][] }
  | { kind: 'days'; days: Array<{ day: number; segments: Segment[] }> }
  | { kind: 'seo'; title: string; description: string }
  /** The tour's own wording in the page language (./translate.ts). */
  | { kind: 'labels'; items: Array<{ source: string; text: string }> }

/** Every part of a page a draft can be: the narrative kinds, and the translated wording. */
export type PartKind = DraftKind | 'labels'

export interface DraftResult {
  status: 'in_review' | 'failed_check'
  content: EngineContent | null
  check: CheckResult
  /** Not fact violations — things a reviewer should know (a missing day, an
   *  over-long title, why there is no content at all). */
  notes: string[]
  sourcesUsed: string[]
  attempts: number
  model: string
  promptVersion: string
}

export interface ModelReply { text: string | null; stopReason: string | null; model: string }
export type ModelCall = (req: {
  system: string
  messages: Anthropic.MessageParam[]
  schema: Record<string, unknown>
}) => Promise<ModelReply>

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish' }

// ---------- the prompt ----------

/** Static for every agency and tour, so it is cached. */
export const SYSTEM_PROMPT = `You write the words on a travel agency's tour page. The page also shows the tour's facts — prices, durations, group sizes, dates, departure days, what is included, cancellation terms — and those come from the agency's records, not from you.

The rule you must keep: never state a fact in your text. Specifically, your text must contain:
- no numbers of any kind: no digits, no number words, no ordinals, no Roman numerals (unless part of a name you were given exactly),
- no prices, currencies, costs, discounts or anything free,
- no dates, months, weekdays, seasons as schedules, or words like "daily",
- no policies or promises: nothing about what is included or excluded, refunds, cancellations, deposits, bookings or guarantees.

When a sentence genuinely needs one of those facts, place a slot segment instead of writing it — but only a slot from the list you are given. The page fills it from the records. Use slots sparingly; most good sentences need none.

Write only from what you are given: the tour's days, places and sights, where it stays, the agency's own notes, and its tone. Do not add history, claims or details that are not in the input. Do not praise the agency beyond the claims it says it may make. Use names exactly as given, and the glossary spellings exactly.

When you use something from the agency's notes, list that note's id in the segment's sources.`

const segmentSchema = (slots: SlotKey[], sourceIds: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['type', 'text', 'slot', 'sources'],
  properties: {
    type: { type: 'string', enum: slots.length ? ['text', 'slot'] : ['text'] },
    text: { type: 'string', description: 'The words, for a text segment; empty for a slot.' },
    slot: { type: 'string', enum: ['', ...slots], description: 'The fact slot, for a slot segment; empty for text.' },
    sources: { type: 'array', items: sourceIds.length ? { type: 'string', enum: sourceIds } : { type: 'string' } },
  },
})

export function outputSchema(kind: DraftKind, slots: SlotKey[], sourceIds: string[], dayNumbers: number[]): Record<string, unknown> {
  const segments = { type: 'array', items: segmentSchema(slots, sourceIds) }
  switch (kind) {
    case 'overview':
      return { type: 'object', additionalProperties: false, required: ['segments'], properties: { segments } }
    case 'highlights':
      return { type: 'object', additionalProperties: false, required: ['items'], properties: {
        items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['segments'], properties: { segments } } },
      } }
    case 'days':
      return { type: 'object', additionalProperties: false, required: ['days'], properties: {
        days: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['day', 'segments'], properties: {
          day: { type: 'integer', enum: dayNumbers }, segments,
        } } },
      } }
    case 'seo':
      return { type: 'object', additionalProperties: false, required: ['title', 'description'], properties: {
        title: { type: 'string' }, description: { type: 'string' },
      } }
  }
}

const TASKS: Record<DraftKind, string> = {
  overview: 'Write the tour overview: two short paragraphs that make a traveller want this journey, from its places and sights. Separate the paragraphs with a blank line inside a text segment.',
  highlights: 'Write between three and six highlights: each one a short phrase or sentence about a place, sight or experience on this tour.',
  days: 'Write a short narrative for each day listed: two to four sentences on what the traveller sees and does, from that day\'s places and sights. Do not number the days in the text; the page shows the day.',
  seo: 'Write the page\'s search title (at most sixty characters, including the tour name) and meta description (at most one hundred and fifty-five characters). No slots here.',
}

/** The user turn: everything particular to this agency, tour and language. */
export function draftPrompt(input: DraftInput, slots: SlotKey[]): string {
  const f = input.facts
  const tour = {
    name: input.tourName,
    agency: input.companyName,
    days: f.days.map(d => ({
      day: d.day,
      city: d.city,
      sights: d.sights,
      meals: (['breakfast', 'lunch', 'dinner'] as const).filter(m => d.meals[m]),
      night: d.overnight ? (d.city ?? 'yes') : null,
    })),
    main_attractions: f.mainAttractions,
    stays: f.accommodation.map(a => (a.kind === 'cruise' ? `Nile cruise: ${a.name}` : a.city ? `${a.name}, ${a.city}` : a.name)),
  }
  const parts = [
    `Language: write in ${LANGUAGE_NAMES[input.language] ?? input.language} only.`,
    `Tone of voice: ${input.brand.tone}.`,
    input.brand.claims.length ? `Claims this agency may make (and no others): ${input.brand.claims.join('; ')}.` : 'This agency has listed no claims it may make: make none.',
    input.brand.avoid.length ? `Words and phrases to avoid: ${input.brand.avoid.join('; ')}.` : '',
    input.glossary.length ? `Spell these names exactly: ${input.glossary.map(g => g.spelling).join('; ')}.` : '',
    `The tour, from the agency's records:\n${JSON.stringify(tour, null, 2)}`,
    slots.length
      ? `Fact slots you may place (the page fills them):\n${slots.map(s => `- ${s}: ${SLOT_MEANING[s]}`).join('\n')}`
      : 'No fact slots are available for this tour: write without any.',
    input.sources.length
      ? `The agency's own notes (use them; cite their ids):\n${input.sources.map(s => `[${s.id}] ${s.title}\n${s.text}`).join('\n\n')}`
      : '',
    input.instruction ? `The reviewer asked for this change: ${input.instruction}` : '',
    `Task: ${TASKS[input.kind]}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

// ---------- reading a reply ----------

type RawSegment = { type?: unknown; text?: unknown; slot?: unknown; sources?: unknown }

function toSegments(raw: unknown, slots: SlotKey[], sourceIds: Set<string>, used: Set<string>): Segment[] {
  if (!Array.isArray(raw)) return []
  const out: Segment[] = []
  for (const r of raw as RawSegment[]) {
    if (r?.type === 'slot' && typeof r.slot === 'string' && (slots as string[]).includes(r.slot)) {
      out.push({ type: 'slot', slot: r.slot })
    } else if (r?.type === 'text' && typeof r.text === 'string' && r.text.trim()) {
      const sources = Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === 'string' && sourceIds.has(s)) : []
      sources.forEach(s => used.add(s))
      out.push({ type: 'text', text: r.text.trim(), ...(sources.length ? { sources } : {}) })
    }
    // A slot the tour cannot fill, or an empty segment, is dropped — never
    // rendered as a blank.
  }
  return out
}

export function readReply(kind: DraftKind, json: unknown, slots: SlotKey[], sourceIds: Set<string>, dayNumbers: number[]):
  { content: EngineContent; used: string[]; notes: string[] } | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  const used = new Set<string>()
  const notes: string[] = []
  switch (kind) {
    case 'overview': {
      const segments = toSegments(j.segments, slots, sourceIds, used)
      return segments.length ? { content: { kind, segments }, used: [...used], notes } : null
    }
    case 'highlights': {
      const items = (Array.isArray(j.items) ? j.items : []).map(i => toSegments((i as { segments?: unknown })?.segments, slots, sourceIds, used)).filter(s => s.length)
      return items.length ? { content: { kind, items }, used: [...used], notes } : null
    }
    case 'days': {
      const byDay = new Map<number, Segment[]>()
      for (const d of Array.isArray(j.days) ? j.days : []) {
        const day = Number((d as { day?: unknown })?.day)
        if (!dayNumbers.includes(day) || byDay.has(day)) continue
        const segments = toSegments((d as { segments?: unknown }).segments, slots, sourceIds, used)
        if (segments.length) byDay.set(day, segments)
      }
      const missing = dayNumbers.filter(n => !byDay.has(n))
      if (missing.length) notes.push(`No narrative for day ${missing.join(', ')}.`)
      return byDay.size ? { content: { kind, days: [...byDay].sort((a, b) => a[0] - b[0]).map(([day, segments]) => ({ day, segments })) }, used: [...used], notes } : null
    }
    case 'seo': {
      const title = typeof j.title === 'string' ? j.title.trim() : ''
      const description = typeof j.description === 'string' ? j.description.trim() : ''
      if (!title || !description) return null
      if (title.length > 60) notes.push(`The title is ${title.length} characters (search shows about sixty).`)
      if (description.length > 160) notes.push(`The description is ${description.length} characters (search shows about one hundred and fifty-five).`)
      return { content: { kind, title, description }, used: [], notes }
    }
  }
}

/** Every piece of text in a draft, as segments the post-check reads. */
export function segmentsOf(content: EngineContent): Segment[] {
  switch (content.kind) {
    case 'overview': return content.segments
    case 'highlights': return content.items.flat()
    case 'days': return content.days.flatMap(d => d.segments)
    case 'seo': return [{ type: 'text', text: content.title }, { type: 'text', text: content.description }]
    case 'labels': return content.items.map(i => ({ type: 'text', text: i.text }))
  }
}

// ---------- the draft loop ----------

export async function draftNarrative(input: DraftInput, callModel: ModelCall): Promise<DraftResult> {
  if (!(input.language in SUPPORTED_LANGUAGES)) throw new Error(`the engine does not write "${input.language}" yet`)
  const slots = input.kind === 'seo' ? [] : availableSlots(input.facts)
  const sourceIds = input.sources.map(s => s.id)
  const dayNumbers = input.facts.days.map(d => d.day)
  if (input.kind === 'days' && dayNumbers.length === 0) {
    return { status: 'failed_check', content: null, check: { ok: false, violations: [], flags: [] }, notes: ['The tour has no days to write about.'], sourcesUsed: [], attempts: 0, model: '', promptVersion: PROMPT_VERSION }
  }

  const schema = outputSchema(input.kind, slots, sourceIds, dayNumbers)
  const checkOpts = {
    language: input.language,
    allowedTerms: namesFromFacts(input.facts, [input.tourName, input.companyName, ...input.glossary.map(g => g.spelling)]),
    allowedClaims: input.brand.claims,
  }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: draftPrompt(input, slots) }]

  let last: { content: EngineContent; check: CheckResult; used: string[]; notes: string[] } | null = null
  let model = ''
  const problems: string[] = []
  let attempts = 0
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    const reply = await callModel({ system: SYSTEM_PROMPT, messages, schema })
    model = reply.model || model
    if (reply.stopReason === 'refusal' || reply.stopReason === 'max_tokens' || !reply.text) {
      problems.push(`The model gave no usable draft (${reply.stopReason ?? 'empty reply'}).`)
      break
    }
    let json: unknown
    try {
      json = JSON.parse(reply.text)
    } catch {
      problems.push('The model\'s reply was not valid JSON.')
      break
    }
    const read = readReply(input.kind, json, slots, new Set(sourceIds), dayNumbers)
    if (!read) {
      problems.push('The model\'s reply had no usable text.')
      break
    }
    const check = checkSegments(segmentsOf(read.content), checkOpts)
    last = { content: read.content, check, used: read.used, notes: read.notes }
    if (check.ok) break
    // Append-only: the reply stays in the conversation, and the correction follows it.
    messages.push({ role: 'assistant', content: reply.text })
    messages.push({ role: 'user', content: `This draft breaks the rule — ${describeViolations(check.violations)}. Rewrite the whole draft without them: remove each one, or use an available fact slot where the sentence truly needs the fact.` })
  }

  return {
    status: last?.check.ok ? 'in_review' : 'failed_check',
    content: last?.content ?? null,
    check: last?.check ?? { ok: false, violations: [], flags: [] },
    notes: [...problems, ...(last?.notes ?? [])],
    sourcesUsed: last?.used ?? [],
    attempts,
    model,
    promptVersion: PROMPT_VERSION,
  }
}

export { SLOT_KEYS }
