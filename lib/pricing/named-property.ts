// ============================================
// The hotel or ship an itinerary NAMES wins over the tier
// ============================================
// Operator, 2026-09-22: "make the engine prioritize picking hotels and cruises
// with its names mentioned in the itinerary over selected tier — and fall back
// to the favoured hotel of the tier if the hotel name is not mentioned."
//
// A programme that says "overnight at the Old Cataract" was priced at whatever
// hotel the selected tier happened to have in Aswan — or, with two hotels in
// the tier and neither starred, not priced at all.
//
// THE ORDER, for each city's nights (and for the sailing):
//   1. the hotel PICKED on the day for this tier (property_by_tier)   — as before
//   2. a property of the agency's own rate sheet NAMED in the text of those
//      days — its full name, as a whole phrase. It wins WHATEVER its tier.
//   3. the selected tier's own hotel: the only one, or the one starred
//      preferred; several with none starred is a gap naming them   — as before
//
// This is not the title-guessing the engine stopped doing (#496): nothing is
// inferred from a word like "temple". Only the exact name of a row the agency
// itself entered in Rates counts, and it is matched as a whole phrase.
//   - Names shorter than four characters never match (a ship called "Isis"
//     is fine; a hotel called "Nil" would match half the brochure).
//   - When one named property's name sits inside another's ("Four Seasons
//     Cairo" inside "Four Seasons Cairo at Nile Plaza"), the LONGER one is the
//     one that was written.
//   - Two different properties named for the same nights is not a choice the
//     engine makes: a gap naming both.
//   - A property with several rate rows (one per tier, or per cabin): the row
//     of the SELECTED tier if there is one, else its only row, else its starred
//     row, else a gap.
//
// Pure and import-free.

export interface PropertyRow {
  id: string
  name: string | null | undefined
  tier?: string | null
  is_preferred?: boolean | null
}

export type NamedPick =
  | { kind: 'none' }
  | { kind: 'one'; rateId: string; name: string; tier: string | null; otherTier: boolean }
  | { kind: 'ambiguous'; names: string[]; reason: 'several_properties' | 'several_rows' }

const MIN_NAME_LENGTH = 4

/** Lower-cased, punctuation → space, single-spaced: how both sides are compared. */
export const phraseKey = (s: string | null | undefined): string =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim()

/** Does the text contain the name as a WHOLE phrase? */
export function mentions(text: string | null | undefined, name: string | null | undefined): boolean {
  const n = phraseKey(name)
  if (n.length < MIN_NAME_LENGTH) return false
  return ` ${phraseKey(text)} `.includes(` ${n} `)
}

export function pickNamedProperty(texts: ReadonlyArray<string | null | undefined>, rows: ReadonlyArray<PropertyRow>, tier: string): NamedPick {
  const text = texts.filter(Boolean).join(' \n ')
  if (!text.trim()) return { kind: 'none' }

  const byName = new Map<string, PropertyRow[]>()
  for (const row of rows) {
    if (!mentions(text, row.name)) continue
    const key = phraseKey(row.name)
    byName.set(key, [...(byName.get(key) ?? []), row])
  }
  // "Four Seasons Cairo" is inside "Four Seasons Cairo at Nile Plaza": the
  // longer name is the one the text wrote.
  const keys = [...byName.keys()]
  const named = keys.filter(k => !keys.some(other => other !== k && ` ${other} `.includes(` ${k} `)))
  if (named.length === 0) return { kind: 'none' }
  if (named.length > 1) {
    return { kind: 'ambiguous', reason: 'several_properties', names: named.map(k => String(byName.get(k)![0].name)) }
  }

  const candidates = byName.get(named[0])!
  const sameTier = candidates.filter(r => (r.tier ?? '') === tier)
  const pool = sameTier.length > 0 ? sameTier : candidates
  const starred = pool.filter(r => r.is_preferred === true)
  const chosen = pool.length === 1 ? pool[0] : starred.length === 1 ? starred[0] : null
  if (!chosen) return { kind: 'ambiguous', reason: 'several_rows', names: [String(candidates[0].name)] }
  return { kind: 'one', rateId: chosen.id, name: String(chosen.name), tier: chosen.tier ?? null, otherTier: (chosen.tier ?? '') !== tier }
}

/** The gap a named-but-unresolvable property leaves. */
export function namedAmbiguityMessage(pick: Extract<NamedPick, { kind: 'ambiguous' }>, what: 'hotel' | 'ship', where: string, page: string): string {
  const list = pick.names.map(n => `"${n}"`).join(' and ')
  return pick.reason === 'several_properties'
    ? `The programme names more than one ${what} ${where}: ${list}. Pricing will not choose between them — open the day in Tour Manager and pick the ${what} for this night.`
    : `The programme names ${list}, which has several rates in ${page} and none of them is for this tier or starred preferred. Star one, or pick it on the day.`
}
