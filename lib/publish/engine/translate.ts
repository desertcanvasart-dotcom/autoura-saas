// ============================================
// Publish — the tour's own wording in the site's second language
// ============================================
// The records hold one language (operator, 2026-10-27: "Use AI to translate
// each tour's content into the site's second language, with a person
// approving it like the other text"). A French or Spanish page would
// otherwise show a French frame around English facts: the tour name, day
// titles, sights, inclusions.
//
//   draftTranslation(input, callModel) → a 'labels' draft for review
//
// The items are the agency's own words from its records (labelSources).
// Business names — hotels and ships — are never sent: they stay as written.
//
// The check is not the narrative's ("no fact outside a slot"): inclusions
// ARE facts. It is FAITHFULNESS — a translation states exactly the facts its
// original states: the same digits and currency signs and codes, number words
// where the original has them, and the same count of dates/weekdays. A translation that adds, drops or
// changes one is sent back with the pair named; after that it is kept as
// `failed_check` for a person. Approval re-runs it (admin.ts).

import type Anthropic from '@anthropic-ai/sdk'
import type { TourFacts } from '../contract'
import type { CheckResult, Violation, ViolationRule } from './fact-check'
import { SUPPORTED_LANGUAGES } from './fact-check'
import type { LanguageWords } from './words/types'
import type { DraftResult, ModelCall } from './engine'

export const TRANSLATION_PROMPT_VERSION = 'publish-labels-v1'
const MAX_ATTEMPTS = 3

export interface LabelItem { source: string; text: string }

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish' }

/** The agency's own words a page shows from its records, each once, in order. */
export function labelSources(facts: TourFacts | null, tourName: string): string[] {
  const out: string[] = []
  const add = (s: string | null | undefined) => {
    const v = (s ?? '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  add(tourName)
  if (!facts) return out
  for (const d of facts.days) { add(d.title); add(d.city); d.sights.forEach(add) }
  facts.mainAttractions.forEach(add)
  facts.highlights.forEach(add)
  facts.inclusions.forEach(add)
  facts.exclusions.forEach(add)
  for (const a of facts.accommodation) add(a.city)
  add(facts.price.tierLabel)
  return out
}

// ---------- the faithfulness check ----------

const DIGIT = /\p{Nd}+(?:[.,:\/-]\p{Nd}+)*/gu
const CURRENCY = /\p{Sc}|(?<![\p{L}])(?:EUR|USD|GBP|EGP|CHF|JPY|CAD|AUD|SAR|AED|LE)(?![\p{L}])/gu

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function wordCount(entries: string[], text: string): number {
  if (!entries.length) return 0
  const alts = [...entries].sort((a, b) => b.length - a.length)
    .map(e => e.endsWith('*') ? `${escape(e.slice(0, -1))}[\\p{L}\\p{M}'’-]*` : escape(e).replace(/ /g, '\\s+'))
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{M}\\p{N}])`, 'giu')
  return [...text.matchAll(re)].length
}
const sorted = (re: RegExp, text: string) => [...text.matchAll(re)].map(m => m[0].replace(/,/g, '.')).sort()
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Whether each translation states the same facts as its original. */
export function checkTranslation(items: LabelItem[], language: string, sourceLanguage = 'en'): CheckResult {
  const words = SUPPORTED_LANGUAGES as Record<string, LanguageWords>
  const to = words[language], from = words[sourceLanguage]
  if (!to || !from) throw new Error(`no word list for "${!to ? language : sourceLanguage}"`)
  const violations: Violation[] = []
  const add = (rule: ViolationRule, item: LabelItem, i: number) =>
    violations.push({ rule, match: `"${item.source}" → "${item.text}"`, segment: i })
  items.forEach((item, i) => {
    if (!same(sorted(DIGIT, item.source), sorted(DIGIT, item.text))) add('digit', item, i)
    if (!same(sorted(CURRENCY, item.source), sorted(CURRENCY, item.text))) add('currency', item, i)
    // Presence, not count: compounds split differently ("seventy" is one
    // word, "soixante-dix" two). Digits above are compared exactly.
    if ((wordCount(from.numbers, item.source) > 0) !== (wordCount(to.numbers, item.text) > 0)) add('number_word', item, i)
    if (wordCount(from.dates, item.source) !== wordCount(to.dates, item.text)) add('date', item, i)
  })
  return { ok: violations.length === 0, violations, flags: [] }
}

const RULE_WORDS: Partial<Record<ViolationRule, string>> = {
  digit: 'its numbers differ', currency: 'its currency or price differs',
  number_word: 'it has a different number of number words', date: 'its dates or weekdays differ',
}
export function describeTranslationProblems(violations: Violation[]): string {
  return violations.map(v => `${v.match}: ${RULE_WORDS[v.rule] ?? v.rule}`).join('; ')
}

// ---------- the prompt ----------

export const TRANSLATION_SYSTEM_PROMPT = `You translate the wording a travel agency's records show on its tour page: the tour's name, day titles, cities, sights, highlights, what is included and not included, and the price tier's name.

Translate faithfully. Each translation must state exactly what its original states: keep every number (as a digit if it was a digit, as a word if it was a word), every currency, date and weekday; add nothing and leave nothing out. Do not improve, embellish or explain.

Place and sight names: use the name travellers know in the target language where one is established (for example the usual name of a city or a famous monument), otherwise keep the name as written. Keep the glossary spellings exactly. Keep the style of a label: short items stay short.`

function translationSchema(sources: string[]): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: { items: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['source', 'text'],
      properties: { source: { type: 'string', enum: sources }, text: { type: 'string' } },
    } } },
  }
}

export interface TranslationInput {
  language: string
  sources: string[]
  glossary: Array<{ term: string; spelling: string }>
  avoid: string[]
  instruction?: string | null
}

export function translationPrompt(input: TranslationInput): string {
  return [
    `Translate into ${LANGUAGE_NAMES[input.language] ?? input.language}.`,
    input.glossary.length ? `Spell these names exactly: ${input.glossary.map(g => `${g.term} → ${g.spelling}`).join('; ')}.` : '',
    input.avoid.length ? `Words and phrases this agency avoids: ${input.avoid.join('; ')}.` : '',
    input.instruction ? `The reviewer asked for this change: ${input.instruction}` : '',
    `Give one item for each of these, with "source" exactly as written:\n${input.sources.map(s => `- ${s}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

/** The model's items, kept only for known sources, each once, in source order. */
export function readTranslation(json: unknown, sources: string[]): { items: LabelItem[]; missing: string[] } {
  const raw = (json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)) ? (json as { items: unknown[] }).items : []
  const bySource = new Map<string, string>()
  for (const r of raw as Array<{ source?: unknown; text?: unknown }>) {
    if (typeof r?.source !== 'string' || typeof r.text !== 'string') continue
    const text = r.text.trim()
    if (sources.includes(r.source) && text && !bySource.has(r.source)) bySource.set(r.source, text.slice(0, 500))
  }
  return {
    items: sources.filter(s => bySource.has(s)).map(source => ({ source, text: bySource.get(source)! })),
    missing: sources.filter(s => !bySource.has(s)),
  }
}

// ---------- the draft loop ----------

export async function draftTranslation(input: TranslationInput, callModel: ModelCall): Promise<DraftResult> {
  if (input.language === 'en') throw new Error('The records are already in English.')
  if (!(input.language in SUPPORTED_LANGUAGES)) throw new Error(`the engine does not translate into "${input.language}" yet`)
  const base = { sourcesUsed: [], model: '', promptVersion: TRANSLATION_PROMPT_VERSION }
  if (input.sources.length === 0) {
    return { ...base, status: 'failed_check', content: null, check: { ok: false, violations: [], flags: [] }, notes: ['The tour has no wording to translate.'], attempts: 0 }
  }
  const schema = translationSchema(input.sources)
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: translationPrompt(input) }]
  let last: { items: LabelItem[]; missing: string[]; check: CheckResult } | null = null
  const problems: string[] = []
  let model = ''
  let attempts = 0
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    const reply = await callModel({ system: TRANSLATION_SYSTEM_PROMPT, messages, schema })
    model = reply.model || model
    if (reply.stopReason === 'refusal' || reply.stopReason === 'max_tokens' || !reply.text) {
      problems.push(`The model gave no usable translation (${reply.stopReason ?? 'empty reply'}).`)
      break
    }
    let json: unknown
    try { json = JSON.parse(reply.text) } catch { problems.push('The model\'s reply was not valid JSON.'); break }
    const read = readTranslation(json, input.sources)
    if (read.items.length === 0) { problems.push('The model\'s reply had no usable translation.'); break }
    const check = checkTranslation(read.items, input.language)
    last = { ...read, check }
    if (check.ok && read.missing.length === 0) break
    messages.push({ role: 'assistant', content: reply.text })
    messages.push({ role: 'user', content: [
      check.ok ? '' : `These translations change a fact — ${describeTranslationProblems(check.violations)}. Translate them again, keeping every number, currency and date exactly.`,
      read.missing.length ? `You left these out: ${read.missing.join('; ')}.` : '',
      'Give the whole list again.',
    ].filter(Boolean).join(' ') })
  }
  const notes = [...problems]
  if (last?.missing.length) notes.push(`Not translated (the page shows these as written): ${last.missing.join('; ')}.`)
  return {
    ...base,
    status: last?.check.ok ? 'in_review' : 'failed_check',
    content: last ? { kind: 'labels', items: last.items } : null,
    check: last?.check ?? { ok: false, violations: [], flags: [] },
    notes,
    attempts,
    model,
  }
}
