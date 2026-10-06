// ============================================
// Which day block is each raw day?
// ============================================
// The AI used to decide every fact of a day — its city, its night, its meals
// and guide — and the code trusted it. With the agency's day blocks in a
// library, the AI's job shrinks to one question per day: which of THESE
// blocks is it, if any? The block then supplies the facts and the services.
//
//   1. Shorthand first, no AI: a day whose own text IS one block's shorthand
//      ("D3 CAI/ALX/CAI L") is that block.
//   2. The rest go to Claude with the library, and its answer is held to the
//      library: a code that is not in it counts as no match; a low-confidence
//      match is only SUGGESTED, never applied.
//   3. A day nothing matches is reported, so the operator checks the AI's
//      reading of it instead of trusting it.
//
// Pure apart from `ask`, which the route supplies (the Claude call).

import type { DayBlock } from './blocks'

export interface RawDay {
  dayNumber: number
  title?: string | null
  city?: string | null
  description?: string | null
  /** The day's own text from the request, when the reader could split it. */
  raw?: string | null
}

export type MatchConfidence = 'high' | 'low'

export interface DayMatch {
  dayNumber: number
  code: string | null
  by: 'shorthand' | 'ai' | 'none'
  confidence: MatchConfidence | null
  reason: string | null
}

/** What Claude is asked to return (structured output). */
export interface AiMatchReply {
  matches: { day_number: number; code: string | null; confidence: MatchConfidence; reason: string }[]
}

const norm = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}/+&-]+/gu, ' ').trim()

/** Does the text carry this shorthand as whole words? */
function carries(text: string, shorthand: string): boolean {
  const s = norm(shorthand)
  if (s.length < 2) return false
  return ` ${text} `.includes(` ${s} `)
}

/** Words a day's text carries beside its shorthand that say nothing about which day it is. */
const FILLER = new Set(['with', 'and', 'incl', 'included', 'lunch', 'dinner', 'breakfast', 'l', 'd', 'b', 'bl', 'ld', 'bd', 'bld', 'l/d', 'b/l', 'b/l/d'])

/** The day's own text, without its "D3" / "Day 3" marker. */
const ownText = (day: RawDay) =>
  norm([day.raw, day.title].filter(Boolean).join(' ')).replace(/^(?:d|day)\s*\d+\s*/, '')

/**
 * The one block a day's own text names by its shorthand, or null. Shorthand
 * decides alone only when it is the day — most of what the day says — and is
 * not just a place name ("Abu Simbel" fits a road trip and a flight alike);
 * anything less goes to the AI, which sees the same text.
 */
export function matchByShorthand(day: RawDay, blocks: readonly DayBlock[]): { code: string; shorthand: string } | null {
  const text = ownText(day)
  if (!text) return null
  const places = new Set(blocks.flatMap(b => [b.city, b.to_city]).map(norm).filter(Boolean))
  const hits: { code: string; shorthand: string }[] = []
  for (const b of blocks) {
    // The longest shorthand of a block is its most specific.
    const best = b.shorthand
      .filter(s => !places.has(norm(s)) && carries(text, s))
      .sort((x, y) => norm(y).length - norm(x).length)[0]
    if (best) hits.push({ code: b.code, shorthand: best })
  }
  if (hits.length === 0) return null
  hits.sort((x, y) => norm(y.shorthand).length - norm(x.shorthand).length)
  // Two blocks named equally specifically: the AI decides, with both in view.
  if (hits.length > 1 && norm(hits[0].shorthand).length === norm(hits[1].shorthand).length) return null
  // A word in a longer sentence ("felucca ride after dinner") is a hint, not
  // the day. Meal codes and filler ("with lunch", "L/D") don't count against it.
  const rest = text.split(' ').filter(w => !FILLER.has(w)).join('')
  if (norm(hits[0].shorthand).replace(/\s+/g, '').length * 2 < rest.length) return null
  return hits[0]
}

// ── The question for Claude ────────────────────────────────────────────────

export const MATCH_SYSTEM = `You match the days of a travel itinerary to an agency's library of standard day blocks.

For each day, choose the ONE block whose day it describes, or null when none does. A block fits when the day is the same kind of day (arrival, tour, transfer, cruise, free, departure), in the same city, visiting substantially the same sites, ending its night in the same way. Small differences in wording or in one optional stop are fine; a different city, a different set of main sites, or a different night is not.

Answer only with codes from the library. Use "high" confidence only when the block clearly is that day; use "low" when it is close but something differs, and say what differs in the reason. Keep each reason under 20 words.`

const blockLine = (b: DayBlock) =>
  [
    `${b.code}: ${b.name}`,
    `type ${b.day_type}`,
    `city ${b.city ?? 'any'}${b.to_city ? ` → ${b.to_city}` : ''}`,
    `night ${b.night}${b.night === 'move' && b.to_city ? ` (${b.to_city})` : b.night_place ? ` (${b.night_place})` : ''}`,
    b.attractions.length ? `sites ${b.attractions.join(', ')}` : '',
    b.photo_stops.length ? `stops ${b.photo_stops.join(', ')}` : '',
    b.shorthand.length ? `shorthand ${b.shorthand.join(' | ')}` : '',
  ].filter(Boolean).join('; ')

const dayLine = (d: RawDay) =>
  [
    `Day ${d.dayNumber}`,
    d.title ? `title: ${d.title}` : '',
    d.city ? `city: ${d.city}` : '',
    d.raw ? `text: ${d.raw}` : '',
    d.description ? `description: ${d.description}` : '',
  ].filter(Boolean).join('\n')

/** The library first (stable across requests), then the days. */
export function matchPrompt(days: readonly RawDay[], blocks: readonly DayBlock[]): { library: string; days: string } {
  return {
    library: `DAY BLOCK LIBRARY\n${blocks.map(blockLine).join('\n')}`,
    days: `DAYS TO MATCH\n\n${days.map(dayLine).join('\n\n')}`,
  }
}

/** The reply's shape; `code` is limited to the library's codes or null. */
export function matchSchema(blocks: readonly DayBlock[]) {
  return {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day_number: { type: 'integer' },
            code: { anyOf: [{ type: 'string', enum: blocks.map(b => b.code) }, { type: 'null' }] },
            confidence: { type: 'string', enum: ['high', 'low'] },
            reason: { type: 'string' },
          },
          required: ['day_number', 'code', 'confidence', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['matches'],
    additionalProperties: false,
  } as const
}

// ── Putting it together ────────────────────────────────────────────────────

export async function matchDaysToBlocks(
  days: readonly RawDay[],
  blocks: readonly DayBlock[],
  ask: (pending: readonly RawDay[]) => Promise<AiMatchReply | null>,
): Promise<DayMatch[]> {
  const out = new Map<number, DayMatch>()
  const pending: RawDay[] = []
  for (const day of days) {
    const hit = matchByShorthand(day, blocks)
    if (hit) out.set(day.dayNumber, { dayNumber: day.dayNumber, code: hit.code, by: 'shorthand', confidence: 'high', reason: `Written as "${hit.shorthand}"` })
    else pending.push(day)
  }

  if (pending.length > 0 && blocks.length > 0) {
    const reply = await ask(pending)
    const codes = new Set(blocks.map(b => b.code))
    const asked = new Set(pending.map(d => d.dayNumber))
    for (const m of reply?.matches ?? []) {
      // Held to the library and to the days asked about.
      if (!asked.has(m.day_number) || out.has(m.day_number)) continue
      const code = m.code && codes.has(m.code) ? m.code : null
      out.set(m.day_number, code
        ? { dayNumber: m.day_number, code, by: 'ai', confidence: m.confidence === 'high' ? 'high' : 'low', reason: m.reason || null }
        : { dayNumber: m.day_number, code: null, by: 'none', confidence: null, reason: m.reason || null })
    }
  }

  return days.map(d => out.get(d.dayNumber) ?? { dayNumber: d.dayNumber, code: null, by: 'none', confidence: null, reason: null })
}
