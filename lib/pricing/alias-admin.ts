// ============================================
// Managing an agency's attraction aliases
// ============================================
// An alias says "when a tour says X, the fee is the one MY sheet calls Y".
// Since migration 370 every alias belongs to one agency — so the agency has
// to be able to see them, fix them and add them without a migration. This is
// the logic behind Settings → Attraction names; pure, so the API and its
// tests share it.
//
// Two lessons from the 27 global rows this replaces, both enforced here:
//
//   1. An alias must land on exactly ONE fee of the agency's own sheet. Nine
//      of the 27 pointed at names on nobody's sheet and quietly turned right
//      wording into "no fee". So one is REFUSED at save time — and if a fee is
//      renamed or removed later, the alias is shown as broken, not hidden.
//   2. "Lands on" is the engine's own rule (lib/pricing/entrance-fee-match.ts),
//      not a second opinion: a fee whose name IS the wording, else the only
//      one that contains it.

import { chooseEntranceFee } from './entrance-fee-match'
import { buildAliasIndex, resolveAttractionAlias, type AttractionAliasRow } from './attraction-aliases'

export const COMBO_SEPARATOR = ' + '
export const MAX_ALIAS_LENGTH = 120

export interface FeeName { attraction_name: string; city?: string | null }

export type AliasHealth =
  | { ok: true; fees: string[] }
  | { ok: false; problem: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function canonicalParts(canonical: string): string[] {
  return canonical.split(COMBO_SEPARATOR).map(p => p.trim()).filter(Boolean)
}

/** Does every part of this canonical land on exactly one fee of the sheet? */
export function aliasHealth(canonical: string, fees: readonly FeeName[]): AliasHealth {
  const parts = canonicalParts(canonical)
  if (parts.length === 0) return { ok: false, problem: 'It does not say which fee to use.' }
  const landed: string[] = []
  for (const part of parts) {
    const choice = chooseEntranceFee(fees, part)
    if (choice.kind === 'none') {
      return { ok: false, problem: `There is no fee called "${part}" on your sheet (Rates → Attractions). It may have been renamed or removed.` }
    }
    if (choice.kind === 'ambiguous') {
      const names = choice.ambiguity.names.map(n => `"${n}"`).join(', ')
      return { ok: false, problem: `"${part}" fits ${choice.ambiguity.count} fees (${names}) and none is named exactly that. Name the fee in full.` }
    }
    landed.push(choice.row.attraction_name)
  }
  return { ok: true, fees: landed }
}

export interface AliasInput { alias?: unknown; canonical?: unknown }
export interface StoredAlias { id: string; alias: string; canonical: string; is_active?: boolean | null }

export type AliasVerdict =
  | { ok: true; alias: string; canonical: string; note?: string }
  | { ok: false; error: string }

/**
 * May this alias be saved? `existing` is the agency's other aliases; pass
 * `selfId` when editing so a row does not collide with itself.
 */
export function validateAlias(
  input: AliasInput,
  fees: readonly FeeName[],
  existing: readonly StoredAlias[],
  selfId?: string
): AliasVerdict {
  const alias = String(input.alias ?? '').trim().replace(/\s+/g, ' ')
  const parts = canonicalParts(String(input.canonical ?? ''))
  if (!alias) return { ok: false, error: 'Say what the tour says — the wording this alias is for.' }
  if (alias.length > MAX_ALIAS_LENGTH) return { ok: false, error: `Keep the wording under ${MAX_ALIAS_LENGTH} characters.` }
  if (alias.includes(COMBO_SEPARATOR)) return { ok: false, error: 'The wording is one attraction. Use " + " only on the fee side, for a ticket that covers several fees.' }
  if (parts.length === 0) return { ok: false, error: 'Choose the fee this wording should be priced as.' }
  if (new Set(parts.map(norm)).size !== parts.length) return { ok: false, error: 'The same fee is listed twice.' }

  const clash = existing.find(e => e.id !== selfId && norm(e.alias) === norm(alias))
  if (clash) return { ok: false, error: `"${clash.alias}" already has an alias (→ ${clash.canonical}). Edit that one instead — a wording can only mean one thing.` }

  const health = aliasHealth(parts.join(COMBO_SEPARATOR), fees)
  if (!health.ok) return { ok: false, error: health.problem }
  // Stored under the sheet's own spelling, so it stays exact.
  const canonical = health.fees.join(COMBO_SEPARATOR)

  if (health.fees.length === 1 && norm(health.fees[0]) === norm(alias)) {
    return { ok: false, error: `"${alias}" is already the name of that fee, so it needs no alias.` }
  }
  // The trap the global rows fell into: rewriting wording that was ALREADY
  // right. Allowed — it is the agency's call — but said out loud.
  const sameNamed = fees.find(f => norm(f.attraction_name) === norm(alias))
  const note = sameNamed
    ? `"${sameNamed.attraction_name}" is itself a fee on your sheet. With this alias a tour that says it is priced as ${canonical} instead.`
    : undefined
  return { ok: true, alias, canonical, ...(note ? { note } : {}) }
}

// ---- what the agency's tours say that finds no fee ----

export interface TourDay { attractions?: unknown; attraction_ids?: unknown }
export interface TourForScan { template_name?: string | null; itinerary?: unknown }

export interface UnresolvedWording {
  wording: string
  /** What the engine actually looks up, when an alias already rewrites it. */
  lookedUpAs: string
  days: number
  tours: string[]
  reason: 'no_fee' | 'several_fees'
  candidates: string[]
}

/**
 * Every attraction wording in the agency's tours that does not reach exactly
 * one fee — by the same steps the engine takes: a day that PICKED its fees
 * (attraction_ids) is silent; otherwise alias first, then the fee lookup.
 */
export function unresolvedWordings(
  tours: readonly TourForScan[],
  aliases: readonly AttractionAliasRow[],
  fees: readonly FeeName[]
): UnresolvedWording[] {
  const index = buildAliasIndex([...aliases])
  const found = new Map<string, UnresolvedWording>()
  for (const tour of tours) {
    const days = Array.isArray(tour.itinerary) ? (tour.itinerary as TourDay[]) : []
    for (const day of days) {
      if (Array.isArray(day.attraction_ids) && day.attraction_ids.length > 0) continue
      const worded = Array.isArray(day.attractions) ? day.attractions.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : []
      for (const wording of worded) {
        for (const lookedUp of resolveAttractionAlias(wording, index)) {
          const choice = chooseEntranceFee(fees, lookedUp)
          if (choice.kind === 'one') continue
          const key = `${norm(wording)}|${norm(lookedUp)}`
          const entry = found.get(key) ?? {
            wording: wording.trim(), lookedUpAs: lookedUp, days: 0, tours: [],
            reason: choice.kind === 'ambiguous' ? 'several_fees' as const : 'no_fee' as const,
            candidates: choice.kind === 'ambiguous' ? choice.ambiguity.names : [],
          }
          entry.days++
          const name = tour.template_name?.trim()
          if (name && !entry.tours.includes(name)) entry.tours.push(name)
          found.set(key, entry)
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => b.days - a.days || a.wording.localeCompare(b.wording))
}
