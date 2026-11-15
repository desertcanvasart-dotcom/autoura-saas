// ============================================
// Several transport companies on one route — which one the engine charges
// ============================================
// Since migration 460 two companies may each price the same route and vehicle
// (Alexandria → Cairo, sedan) at their own price. The engine's transport
// lookup finds a journey by service type, city / road, length, area and
// vehicle — so both companies' rows answer the same question. The rule is the
// one hotels, ships and restaurants follow (lib/pricing/candidate-selection):
//
//   1. one company prices it            → its rows, as before
//   2. several, exactly one starred     → the starred company's rows only
//   3. several, none or many starred    → AMBIGUOUS: every row of the group
//                                         carries the ambiguity, and a lookup
//                                         that lands on one is a pricing hole
//                                         naming the companies. Never a guess.
//
// The star is read per COMPANY: any starred row of a company stars it, so a
// company's several named routes in one city need not each be starred.
//
// What this deliberately does NOT change: one company's several differently
// named routes in one city (live: 19 Aswan day-tour routes of one company,
// 2026-11-05). Those are not a choice between suppliers, and the engine keeps
// treating them as it always has.

import { type Ambiguity, AMBIGUITY_NAMES_SHOWN } from '@/lib/pricing/candidate-selection'

export interface TransportSupplierRow {
  service_type?: string | null
  city?: string | null
  origin_city?: string | null
  destination_city?: string | null
  duration?: string | null
  area?: string | null
  vehicle_type?: string | null
  supplier_id?: string | null
  is_preferred?: boolean | null
}

const low = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** What the engine matches a journey on — the same question both companies answer. */
export function transportJourneyKey(r: TransportSupplierRow): string {
  return [low(r.service_type), low(r.city), low(r.origin_city), low(r.destination_city), low(r.duration), low(r.area), low(r.vehicle_type)].join('\u0000')
}

const NO_SUPPLIER = ''

/**
 * Apply the rule to a tenant's transport rows. Returns them in their original
 * order: a group with one company untouched, a starred company's rows alone,
 * or every row of an undecided group with `ambiguity` set.
 */
export function resolveTransportSuppliers<T extends TransportSupplierRow>(
  rows: readonly T[],
  supplierName: (supplierId: string | null) => string,
): Array<T & { ambiguity?: Ambiguity }> {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = transportJourneyKey(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }

  const dropped = new Set<T>()
  const ambiguous = new Map<T, Ambiguity>()
  for (const group of groups.values()) {
    const companies = [...new Set(group.map(r => r.supplier_id || NO_SUPPLIER))]
    if (companies.length < 2) continue
    const starred = [...new Set(group.filter(r => r.is_preferred === true).map(r => r.supplier_id || NO_SUPPLIER))]
    if (starred.length === 1) {
      for (const r of group) if ((r.supplier_id || NO_SUPPLIER) !== starred[0]) dropped.add(r)
      continue
    }
    const a: Ambiguity = {
      count: companies.length,
      names: companies.slice(0, AMBIGUITY_NAMES_SHOWN).map(c => supplierName(c || null)),
      preferredCount: starred.length,
    }
    for (const r of group) ambiguous.set(r, a)
  }

  const out: Array<T & { ambiguity?: Ambiguity }> = []
  for (const r of rows) {
    if (dropped.has(r)) continue
    const a = ambiguous.get(r)
    out.push(a ? { ...r, ambiguity: a } : r)
  }
  return out
}

/** Distinct supplier ids among the rows that share a journey with another company — the only ones a hole message names. */
export function suppliersNeedingNames(rows: readonly TransportSupplierRow[]): string[] {
  const byJourney = new Map<string, Set<string>>()
  for (const r of rows) {
    const k = transportJourneyKey(r)
    const set = byJourney.get(k) ?? new Set<string>()
    set.add(r.supplier_id || NO_SUPPLIER)
    byJourney.set(k, set)
  }
  const ids = new Set<string>()
  for (const set of byJourney.values()) {
    if (set.size < 2) continue
    for (const id of set) if (id) ids.add(id)
  }
  return [...ids]
}

// ============================================
// One company, several named cards answering the same lookup
// ============================================
// The engine finds a journey by service type, city (or road), length, area and
// vehicle — not by the card's name. A company often keeps several cards that
// answer the same lookup: 12 "Local Transfer · Luxor" cards (Karnak, Luxor
// Temple, West Bank, Dendera…), "Airport – Hotel · Cairo" for Cairo airport
// and for Sphinx airport. The cache used to keep whichever row it read last —
// a silent, arbitrary pick (operator, 2026-11-15: it priced a Cairo arrival at
// the full-day airport card).
//
// Operator decision, 2026-11-15 ("cheapest plus warning"):
//   1. one card                     → it, as before
//   2. several, starred card(s)     → the starred ones only; one starred card
//                                     is the answer, no warning
//   3. several, none starred (or several starred) → the CHEAPEST of them, and
//                                     the lookup carries `routeChoice`, which the
//                                     engine turns into a warning naming the
//                                     others. Pricing never stops for it.
// A group still undecided between COMPANIES (resolveTransportSuppliers) is
// left as it is: that is a hole, not a choice of card.

export interface RouteChoiceRow extends TransportSupplierRow {
  route_name?: string | null
  base_rate_eur?: number | string | null
  ambiguity?: Ambiguity
}

export interface RouteChoice {
  /** The card priced. */
  chosen: string
  /** The other cards that answer the same lookup. */
  others: string[]
  /** Whether the choice was among starred cards (several starred) or all of them. */
  amongStarred: boolean
}

const isIntercityType = (t: unknown) => low(t).startsWith('intercity')

/** The question a cached row answers — the engine's own lookup keys. */
export function transportLookupKey(r: TransportSupplierRow): string {
  if (isIntercityType(r.service_type)) {
    return ['road', low(r.service_type), low(r.origin_city || r.city), low(r.destination_city), low(r.vehicle_type)].join('\u0000')
  }
  return ['city', low(r.service_type), low(r.city), low(r.duration), low(r.area), low(r.vehicle_type)].join('\u0000')
}

const cardName = (r: RouteChoiceRow) => String(r.route_name ?? '').trim()
const price = (r: RouteChoiceRow) => { const n = Number(r.base_rate_eur); return Number.isFinite(n) ? n : Infinity }

/**
 * Keep ONE row per lookup when one company's several cards answer it: the
 * starred card, else the cheapest (marked with `routeChoice`). Rows keep their
 * original order; groups with one card, or undecided between companies, pass
 * through untouched.
 */
export function chooseTransportCards<T extends RouteChoiceRow>(rows: readonly T[]): Array<T & { routeChoice?: RouteChoice }> {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = transportLookupKey(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const keep = new Map<T, RouteChoice | null>()
  for (const group of groups.values()) {
    const names = [...new Set(group.map(cardName))]
    if (names.length < 2 || group.some(r => r.ambiguity)) { for (const r of group) keep.set(r, null); continue }
    const starred = group.filter(r => r.is_preferred === true)
    const starredNames = new Set(starred.map(cardName))
    const pool = starred.length > 0 ? starred : group
    const chosen = [...pool].sort((a, b) => price(a) - price(b) || cardName(a).localeCompare(cardName(b)))[0]
    const choice: RouteChoice | null = starredNames.size === 1
      ? null
      : { chosen: cardName(chosen), others: names.filter(n => n !== cardName(chosen)), amongStarred: starred.length > 0 }
    keep.set(chosen, choice)
  }
  const out: Array<T & { routeChoice?: RouteChoice }> = []
  for (const r of rows) {
    if (!keep.has(r)) continue
    const c = keep.get(r)
    out.push(c ? { ...r, routeChoice: c } : r)
  }
  return out
}

/** The quote's warning for a cheapest-of-several pick. */
export function routeChoiceWarning(day: number, what: string, c: RouteChoice): string {
  const all = [c.chosen, ...c.others]
  const listed = all.slice(0, AMBIGUITY_NAMES_SHOWN + 1).join(', ') + (all.length > AMBIGUITY_NAMES_SHOWN + 1 ? ', …' : '')
  return `Day ${day}: ${all.length} cards answer ${what} (${listed}) — priced the cheapest, "${c.chosen}". ` +
    `${c.amongStarred ? 'Several are starred: keep the star on one' : 'Star the usual one'} in Rates → Transportation.`
}
