// ============================================
// Publish — the post-check: no fact outside a fact slot
// ============================================
// docs/publish/PLAN.md §9, the module's one rule. Text written for a page —
// by the content engine OR by a person editing a draft — may not state a
// number, a price or currency, a date or schedule, or a policy or promise.
// Those are fact slots, filled from the records when the page renders. This
// check runs on every engine draft and on every edit before approval; a
// draft that fails it cannot be approved.
//
// Proper names the records or the agency's glossary supply ("Ramses II",
// "KV62", "Travel2Egypt", a ship called "MS Nile 1886") are masked first, so
// a name is never a violation. Superlatives and claims ("the best", "since",
// "licensed") are FLAGGED for the reviewer unless the brand's claim list
// allows them — never rejected, because "only" and "unique" are often fair.
//
// Pure: the engine, the approval route (step 7) and the tests share it.

import type { LanguageWords } from './words/types'
import { en } from './words/en'
import { fr } from './words/fr'
import { es } from './words/es'

export const SUPPORTED_LANGUAGES = { en, fr, es } as const satisfies Record<string, LanguageWords>
export type EngineLanguage = keyof typeof SUPPORTED_LANGUAGES

export type ViolationRule = 'digit' | 'roman_numeral' | 'number_word' | 'currency' | 'date' | 'policy'

export interface Violation {
  rule: ViolationRule
  /** The words as written, for the reviewer and for the engine's retry. */
  match: string
  /** Which segment (index into the draft's segments), when checking a draft. */
  segment?: number
}

export interface ClaimFlag {
  match: string
  segment?: number
}

export interface CheckResult {
  ok: boolean
  violations: Violation[]
  /** For the reviewer: claims not on the brand's claim list. */
  flags: ClaimFlag[]
}

export interface CheckOptions {
  language: string
  /** Names from the records and the glossary: never a violation. */
  allowedTerms?: string[]
  /** The brand's claim list ("licensed by ETAA", "Egyptologist guides"). */
  allowedClaims?: string[]
}

const MASK = '█'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A word-boundary pattern that works for accented letters (\b does not). */
function wordPattern(entries: string[], flags = 'giu'): RegExp | null {
  if (entries.length === 0) return null
  const alts = [...entries]
    .sort((a, b) => b.length - a.length)
    .map(e => e.endsWith('*')
      ? `${escape(e.slice(0, -1))}[\\p{L}\\p{M}'’-]*`
      : escape(e).replace(/ /g, '\\s+'))
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{M}\\p{N}])`, flags)
}

const cache = new Map<string, Record<string, RegExp | null>>()
function patternsFor(language: string): Record<string, RegExp | null> {
  const hit = cache.get(language)
  if (hit) return hit
  const w = (SUPPORTED_LANGUAGES as Record<string, LanguageWords>)[language]
  if (!w) throw new Error(`no post-check word list for language "${language}" — a language needs one before a site can use it`)
  const p = {
    number_word: wordPattern(w.numbers),
    currency: wordPattern(w.currency),
    date: wordPattern(w.dates),
    dateCapitalised: w.capitalisedOnly ? wordPattern(w.capitalisedOnly, 'gu') : null,
    policy: wordPattern(w.policyStems),
    claims: wordPattern(w.claims),
  }
  cache.set(language, p)
  return p
}

// Every script's decimal digits; any currency sign; ISO codes; Roman numerals
// of two or more letters, upper case (a lone "I" is a pronoun).
const DIGIT = /\p{Nd}+(?:[.,:\/-]\p{Nd}+)*/gu
const CURRENCY_SIGN = /\p{Sc}/gu
const CURRENCY_CODE = /(?<![\p{L}])(?:EUR|USD|GBP|EGP|CHF|JPY|CAD|AUD|SAR|AED|LE)(?![\p{L}])/gu
const ROMAN = /(?<![\p{L}])(?=[MDCLXVI]{2,}(?![\p{L}]))M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})(?![\p{L}])/gu

/** Replace allowed names with a mask, longest first, case-insensitively. */
function maskTerms(text: string, terms: string[]): string {
  let out = text
  for (const term of [...new Set(terms.map(t => t.trim()).filter(t => t.length > 1))].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escape(term), 'giu'), m => MASK.repeat(m.length))
  }
  return out
}

function allMatches(re: RegExp | null, text: string): string[] {
  if (!re) return []
  re.lastIndex = 0
  return [...text.matchAll(re)].map(m => m[0]).filter(m => m.trim() !== '')
}

/** Check one piece of text. */
export function checkText(text: string, opts: CheckOptions): CheckResult {
  const p = patternsFor(opts.language)
  const masked = maskTerms(text, opts.allowedTerms ?? [])
  const violations: Violation[] = []
  const add = (rule: ViolationRule, matches: string[]) => { for (const match of matches) violations.push({ rule, match }) }

  add('digit', allMatches(DIGIT, masked))
  add('roman_numeral', allMatches(ROMAN, masked))
  add('number_word', allMatches(p.number_word, masked))
  add('currency', [...allMatches(CURRENCY_SIGN, masked), ...allMatches(CURRENCY_CODE, masked), ...allMatches(p.currency, masked)])
  // Capitalised-only month names ("May"), except at the start of a sentence.
  const capitalised = allMatches(p.dateCapitalised, masked.replace(/(^|[.!?…]\s+)May\b/gu, '$1may'))
  add('date', [...allMatches(p.date, masked), ...capitalised])
  add('policy', allMatches(p.policy, masked))

  const claimText = maskTerms(masked, opts.allowedClaims ?? [])
  const flags = allMatches(p.claims, claimText).map(match => ({ match }))
  return { ok: violations.length === 0, violations, flags }
}

/** A draft's segments: text is checked, slots are facts and pass. */
export type Segment =
  | { type: 'text'; text: string; sources?: string[] }
  | { type: 'slot'; slot: string }

export function checkSegments(segments: Segment[], opts: CheckOptions): CheckResult {
  const violations: Violation[] = []
  const flags: ClaimFlag[] = []
  segments.forEach((s, i) => {
    if (s.type !== 'text') return
    const r = checkText(s.text, opts)
    violations.push(...r.violations.map(v => ({ ...v, segment: i })))
    flags.push(...r.flags.map(f => ({ ...f, segment: i })))
  })
  return { ok: violations.length === 0, violations, flags }
}

/** The violations as one instruction the engine can act on in a retry. */
export function describeViolations(violations: Violation[]): string {
  const words: Record<ViolationRule, string> = {
    digit: 'a number', roman_numeral: 'a Roman numeral', number_word: 'a number written as a word',
    currency: 'a currency or price', date: 'a date, weekday or schedule', policy: 'a price, policy or promise word',
  }
  return violations.map(v => `"${v.match}" is ${words[v.rule]}`).join('; ')
}
