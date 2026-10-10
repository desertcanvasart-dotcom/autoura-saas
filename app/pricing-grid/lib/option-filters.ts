// ============================================
// Narrowing a service's dropdown: one entry per route, city and kind filters
// ============================================
// The transport list held one entry per route AND per vehicle — "Change (71
// more)" on one Cairo day — in a 150px box that stopped at 25, so finding a
// route took scrolling and guessing (operator, 2026-10-10). The vehicle in
// each entry was moot anyway: the calculator re-picks the vehicle from the
// group size (resolveTransportRate). So the list shows each route once, at
// the vehicle that seats the group, and every list can be narrowed by city
// and by its kind (transport type, fee or meal category).
//
// Pure: SlotRow and the tests share it.

import type { RateOption } from '../types'

type Located = RateOption & { origin_city?: string | null; destination_city?: string | null }

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/** The route a tiered transport option belongs to: `${rowId}__${tier}` → rowId. */
export const routeKey = (o: RateOption) => {
  const sep = o.id.indexOf('__')
  return sep === -1 ? o.id : o.id.slice(0, sep)
}

/** A transport option's name without its vehicle: "Van (8-12 pax) — Cairo Day Tour" → "Cairo Day Tour". */
export const routeLabel = (name: string) => name.replace(/^.*?\(\d+-\d+ pax\)\s*—\s*/, '').trim() || name

/** The vehicle part of a transport option's name: "Van (8-12 pax)". */
export const vehicleLabel = (name: string) => name.match(/^(.*?\(\d+-\d+ pax\))\s*—/)?.[1] ?? null

/** Of one route's vehicles, the one for `pax`: the band that holds the group
 *  (cheapest if several), else the smallest that seats it, else the largest —
 *  the same pick the day blocks make (grid-apply.ts). */
export function vehicleForPax(tiers: RateOption[], pax: number): RateOption {
  const fits = tiers.filter(o => (o.capacity_min ?? 1) <= pax && pax <= (o.capacity_max ?? 99))
  if (fits.length) return [...fits].sort((a, b) => a.rateEur - b.rateEur)[0]
  const seats = tiers.filter(o => (o.capacity_max ?? 99) >= pax).sort((a, b) => (a.capacity_max ?? 99) - (b.capacity_max ?? 99))
  if (seats.length) return seats[0]
  return [...tiers].sort((a, b) => (b.capacity_max ?? 0) - (a.capacity_max ?? 0))[0]
}

/** Each route once, at the vehicle that seats `pax`. Options that are not
 *  tiered (a cruise transport package) pass through. Order is kept. */
export function onePerRoute(options: RateOption[], pax: number): RateOption[] {
  const groups = new Map<string, RateOption[]>()
  for (const o of options) {
    const k = routeKey(o)
    const g = groups.get(k)
    if (g) g.push(o)
    else groups.set(k, [o])
  }
  return [...groups.values()].map(g => (g.length === 1 ? g[0] : vehicleForPax(g, pax)))
}

/** Every city an option is in or runs between. */
export function optionCities(o: RateOption): string[] {
  const l = o as Located
  return [l.city, l.origin_city, l.destination_city].map(c => String(c ?? '').trim()).filter(Boolean)
}

/** The cities a list of options covers, A→Z, each once (case-insensitive). */
export function citiesOf(options: RateOption[]): string[] {
  const byKey = new Map<string, string>()
  for (const o of options) for (const c of optionCities(o)) if (!byKey.has(norm(c))) byKey.set(norm(c), c)
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

export const inCity = (o: RateOption, city: string) => optionCities(o).some(c => norm(c) === norm(city))

/** What a list can be narrowed by besides city: one select per field that
 *  holds more than one value (transport type, category, guide language,
 *  board basis). */
export type FacetField = 'service_type' | 'category' | 'language' | 'board_basis'
export type Facet = { field: FacetField; values: string[] }
const FACET_FIELDS: FacetField[] = ['service_type', 'category', 'language', 'board_basis']

const facetValue = (o: RateOption, field: FacetField) => String((o as unknown as Record<string, unknown>)[field] ?? '').trim()

export function facetsOf(options: RateOption[]): Facet[] {
  const out: Facet[] = []
  for (const field of FACET_FIELDS) {
    const values = [...new Set(options.map(o => facetValue(o, field)).filter(Boolean))].sort()
    if (values.length > 1) out.push({ field, values })
  }
  return out
}

export const FACET_LABEL: Record<FacetField, string> = {
  service_type: 'type', category: 'category', language: 'language', board_basis: 'board',
}

/** "intercity_day_trip" → "Intercity Day Trip". */
export const humanize = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())

export interface OptionFilter {
  /** '' = the day's own list; '*' = every city; else one city. */
  city: string
  /** Per facet field, the value chosen ('' or absent = any). */
  facets: Partial<Record<FacetField, string>>
  search: string
}

/**
 * The options to show. `dayOptions` is the day's own list (DayRow already
 * narrowed it to the day's cities); `allOptions` is everything. A search or a
 * city choice looks in everything, as the search always did.
 */
export function filterOptions(
  dayOptions: RateOption[],
  allOptions: RateOption[],
  filter: OptionFilter,
): RateOption[] {
  const q = norm(filter.search)
  let pool = filter.city === '' && !q ? dayOptions : allOptions
  if (filter.city && filter.city !== '*') pool = pool.filter(o => inCity(o, filter.city))
  for (const [field, value] of Object.entries(filter.facets) as [FacetField, string | undefined][]) {
    if (value) pool = pool.filter(o => facetValue(o, field) === value)
  }
  if (q) pool = pool.filter(o => `${o.name} ${o.details ?? ''} ${optionCities(o).join(' ')}`.toLowerCase().includes(q))
  return pool
}
