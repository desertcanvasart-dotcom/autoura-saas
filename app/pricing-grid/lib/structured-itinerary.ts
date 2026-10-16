// ============================================
// The agency's itinerary format — read without the AI
// ============================================
// Free text goes to the AI parser, which guesses: which hotel, which tier,
// transfer or tour. Text written in the format below names the agency's own
// rates, so there is nothing to guess: each line is matched to the grid's
// rate options by name, here in the browser — exact, instant, and free.
//
//   Package: Full Package
//   Tier: luxury
//   Travellers: 2
//   Start: 2026-11-01
//
//   Day 1 — Cairo
//   Transport: Cairo Airport Transfer (sedan)
//   Hotel: Marriott Mena House
//   Entrances: Pyramids of Giza; Egyptian Museum
//
// It is the same format the parse readback writes ("Copy as text"), so a
// finished grid copied out can be edited and pasted back in. A line naming
// no rate is not guessed at: it is said, for the operator to pick.

import { SLOT_DEFINITIONS, type AllRates, type GridDay, type RateOption, type SelectedItem } from '../types'
import { optionItems } from './option-item'
import { vehicleForPax } from './option-filters'
import { PACKAGE_TYPE_CONFIGS, type PackageType } from '@/lib/package-types'

/** The words a line may start with, for each grid slot. */
const SLOT_KEYS: Record<string, string> = {
  transport: 'route', transfer: 'route', transfers: 'route', route: 'route',
  hotel: 'accommodation', accommodation: 'accommodation',
  guide: 'guide',
  'airport services': 'airport_services',
  'hotel services': 'hotel_services',
  tipping: 'tipping', tips: 'tipping',
  'boat rides': 'boat_rides', boat: 'boat_rides',
  entrances: 'entrance_fees', 'entrance fees': 'entrance_fees', sites: 'entrance_fees',
  flights: 'flights', flight: 'flights',
  experiences: 'experiences', activities: 'experiences',
  meals: 'meals', meal: 'meals',
  cruise: 'cruise',
  'other (group)': 'other_group', 'other group': 'other_group',
  'other (pp)': 'other_pp', 'other pp': 'other_pp',
}

const HEADER_KEYS = new Set(['package', 'tier', 'travellers', 'travelers', 'pax', 'start', 'start date'])
const NOTE_KEYS = new Set(['notes', 'note', 'description'])

const DAY_LINE = /^\s*day\s+(\d+)\s*(?:[—–:\-]\s*(.*))?$/i
const KEY_LINE = /^\s*([a-z][a-z ()]{1,24}?)\s*:\s*(.*)$/i

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()
/** A name without its trailing "(…)" detail: "Mena House Giza (luxury | BB)" → "Mena House Giza". */
const base = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim()

interface Line { key: string; value: string }

function classify(raw: string): { day: { n: number; rest: string } } | { header: Line } | { slot: Line } | { note: string } | null {
  const line = raw.trim()
  if (!line) return null
  const d = line.match(DAY_LINE)
  if (d) return { day: { n: Number(d[1]), rest: (d[2] ?? '').trim() } }
  const k = line.match(KEY_LINE)
  if (k) {
    const key = norm(k[1]).replace(/ (group|pp)$/, ' ($1)')
    const keyPlain = norm(k[1])
    if (HEADER_KEYS.has(keyPlain)) return { header: { key: keyPlain, value: k[2].trim() } }
    if (NOTE_KEYS.has(keyPlain)) return { note: k[2].trim() }
    const slotId = SLOT_KEYS[key] ?? SLOT_KEYS[keyPlain]
    if (slotId) return { slot: { key: slotId, value: k[2].trim() } }
  }
  return { note: line }
}

/**
 * True when the text is written in the format: it has day lines, and most of
 * what follows them is "Slot: names" lines — not an email that happens to
 * say "Hotel:" once.
 */
export function isStructuredItinerary(text: string): boolean {
  let days = 0, slots = 0, other = 0
  for (const raw of text.split(/\r?\n/)) {
    const c = classify(raw)
    if (!c) continue
    if ('day' in c) days++
    else if ('slot' in c) slots++
    else if ('note' in c) other++
  }
  return days >= 1 && slots >= days && slots >= 2 * other
}

export interface StructuredHeader {
  packageType?: PackageType
  tier?: string
  pax?: number
  startDate?: string
}

export function readStructuredHeader(text: string): StructuredHeader {
  const out: StructuredHeader = {}
  for (const raw of text.split(/\r?\n/)) {
    const c = classify(raw)
    if (!c || !('header' in c)) continue
    const { key, value } = c.header
    if (key === 'package') {
      const v = norm(value)
      const pkg = PACKAGE_TYPE_CONFIGS.find(p => norm(p.name) === v || norm(p.slug) === v)
      if (pkg) out.packageType = pkg.slug
    } else if (key === 'tier') {
      if (value.trim()) out.tier = value.trim().toLowerCase()
    } else if (key === 'start' || key === 'start date') {
      const m = value.match(/\d{4}-\d{2}-\d{2}/)
      if (m) out.startDate = m[0]
    } else {
      const n = parseInt(value, 10)
      if (n > 0) out.pax = n
    }
  }
  return out
}

const routeIdOf = (id: string) => (id.includes('__') ? id.slice(0, id.indexOf('__')) : id)
const vehicleOf = (id: string) => (id.includes('__') ? norm(id.slice(id.indexOf('__') + 2)) : '')

/**
 * The rate option a written name means, or null. Exact name first; then the
 * name without its "(…)" detail; then the one option whose name contains it
 * (or that it contains) — the day's city breaking a tie. Never a guess
 * between two that fit equally.
 */
export function matchOption(written: string, options: RateOption[], city: string): RateOption | null {
  const w = norm(written)
  const wBase = norm(base(written))
  if (!w) return null
  const exact = options.filter(o => norm(o.name) === w)
  if (exact.length) return exact[0]
  const byBase = options.filter(o => norm(base(o.name)) === wBase)
  const pool = byBase.length ? byBase
    : options.filter(o => { const n = norm(base(o.name)); return wBase.length >= 4 && (n.includes(wBase) || (n.length >= 4 && wBase.includes(n))) })
  if (pool.length <= 1) return pool[0] ?? null
  const c = norm(city)
  const inCity = c ? pool.filter(o => norm(o.city) === c || norm(o.name).includes(c)) : []
  if (inCity.length === 1) return inCity[0]
  // One route listed per vehicle is still one route.
  const routes = new Set((inCity.length ? inCity : pool).map(o => routeIdOf(o.id)))
  return routes.size === 1 ? (inCity.length ? inCity : pool)[0] : null
}

/** "Cairo Airport Transfer (sedan)" → the route, at that vehicle, else the one that seats the party. */
function pickRoute(written: string, options: RateOption[], city: string, pax: number): RateOption | null {
  const m = written.match(/\(([^)]+)\)\s*$/)
  const wantVehicle = m ? norm(m[1]) : ''
  const name = wantVehicle && options.some(o => vehicleOf(o.id) === wantVehicle) ? base(written) : written
  const hit = matchOption(name, options, city)
  if (!hit) return null
  const family = options.filter(o => routeIdOf(o.id) === routeIdOf(hit.id))
  return family.find(o => vehicleOf(o.id) === wantVehicle) ?? vehicleForPax(family, pax)
}

export interface StructuredResult {
  days: GridDay[]
  header: StructuredHeader
  /** Lines that named no rate: said, not guessed. */
  unmatched: string[]
}

const splitNames = (value: string) =>
  value.split(';').map(s => s.trim()).filter(s => s && !/^(none|nothing selected|-|—)$/i.test(s))

export function parseStructuredItinerary(text: string, rates: AllRates, pax: number, newId: () => string): StructuredResult {
  const header = readStructuredHeader(text)
  const party = header.pax ?? pax
  const days: GridDay[] = []
  const unmatched: string[] = []
  let current: GridDay | null = null
  const items: Record<string, SelectedItem[]> = {}
  let custom: Record<string, number> = {}
  const notes: string[] = []

  const close = () => {
    if (!current) return
    current.slots = SLOT_DEFINITIONS.map(def => ({
      slotId: def.slotId,
      selectedItems: items[def.slotId] ?? [],
      customAmount: custom[def.slotId] ?? 0,
    }))
    current.description = notes.join(' ')
    days.push(current)
    for (const k of Object.keys(items)) delete items[k]
    custom = {}
    notes.length = 0
  }

  for (const raw of text.split(/\r?\n/)) {
    const c = classify(raw)
    if (!c) continue
    if ('day' in c) {
      close()
      const city = c.day.rest.replace(/\(.*?\)/g, '').split(/[—–,/]/)[0].trim()
      current = {
        id: newId(), dayNumber: c.day.n, title: c.day.rest || `Day ${c.day.n}`, city,
        description: '', isExpanded: false, slots: [],
      }
      continue
    }
    if (!current) continue
    if ('note' in c) { if (!/^nothing selected$/i.test(c.note)) notes.push(c.note); continue }
    if (!('slot' in c)) continue
    const { key: slotId, value } = c.slot
    const def = SLOT_DEFINITIONS.find(d => d.slotId === slotId)
    if (!def) continue
    if (def.selectionMode === 'custom') {
      const amount = Number((value.match(/\d+(?:\.\d+)?/) ?? [])[0])
      if (amount > 0) custom[slotId] = amount
      continue
    }
    const options = (rates as unknown as Record<string, RateOption[]>)[slotId] ?? []
    for (const name of splitNames(value)) {
      const opt = slotId === 'route' ? pickRoute(name, options, current.city, party) : matchOption(name, options, current.city)
      if (!opt) {
        unmatched.push(`Day ${current.dayNumber}: ${def.label} "${name}" matches none of your rates${slotId === 'accommodation' ? ' on this tier' : ''} — pick it in the grid, or write it as it is named in Rates.`)
        continue
      }
      const picked = optionItems(slotId, opt)
      items[slotId] = def.selectionMode === 'single' ? picked : [...(items[slotId] ?? []), ...picked]
    }
  }
  close()
  return { days, header, unmatched }
}

// ============================================
// The template — the format, in the agency's own names
// ============================================

const firstNames = (options: RateOption[] | undefined, n: number) =>
  [...new Set((options ?? []).map(o => o.name))].slice(0, n)

export interface TemplateContext {
  packageName?: string
  tier?: string
  pax?: number
  startDate?: string
}

/** A two-day example written with names from the agency's own rates. */
export function itineraryTemplate(rates: AllRates | null, ctx: TemplateContext = {}): string {
  const route = firstNames(rates?.route, 2)
  const hotel = firstNames(rates?.accommodation, 1)[0]
  const guide = firstNames(rates?.guide, 1)[0]
  const sites = firstNames(rates?.entrance_fees, 2)
  const meal = firstNames(rates?.meals, 1)[0]
  const city = rates?.accommodation?.[0]?.city || rates?.entrance_fees?.[0]?.city || 'Cairo'
  const line = (k: string, v: string | undefined) => (v ? `${k}: ${v}` : null)
  return [
    `Package: ${ctx.packageName ?? 'Full Package'}`,
    `Tier: ${ctx.tier ?? 'standard'}`,
    `Travellers: ${ctx.pax ?? 2}`,
    `Start: ${ctx.startDate || 'YYYY-MM-DD'}`,
    '',
    `Day 1 — ${city}`,
    line('Transport', route[0]),
    line('Hotel', hotel),
    line('Notes', 'Arrival, meet and transfer to the hotel'),
    '',
    `Day 2 — ${city}`,
    line('Transport', route[1] ?? route[0]),
    line('Hotel', hotel),
    line('Guide', guide),
    line('Entrances', sites.join('; ')),
    line('Meals', meal),
  ].filter(l => l !== null).join('\n')
}

/** Every name the format accepts, by line — for the operator to copy from. */
export function namesList(rates: AllRates | null): string {
  if (!rates) return ''
  const words: Array<[string, string]> = [
    ['Transport', 'route'], ['Hotel', 'accommodation'], ['Guide', 'guide'],
    ['Entrances', 'entrance_fees'], ['Meals', 'meals'], ['Experiences', 'experiences'],
    ['Boat Rides', 'boat_rides'], ['Airport Services', 'airport_services'],
    ['Hotel Services', 'hotel_services'], ['Tipping', 'tipping'], ['Flights', 'flights'], ['Cruise', 'cruise'],
  ]
  const blocks: string[] = []
  for (const [word, slotId] of words) {
    const names = [...new Set(((rates as unknown as Record<string, RateOption[]>)[slotId] ?? []).map(o => o.name))]
      .sort((a, b) => a.localeCompare(b))
    if (names.length) blocks.push(`${word}:\n${names.map(n => `  ${n}`).join('\n')}`)
  }
  return [
    'Write each line as "Word: name; name". Names are matched to your rates as written below.',
    'Transport may end with the vehicle in brackets, e.g. "(sedan)"; without it, the vehicle that seats the party is used.',
    '',
    ...blocks,
  ].join('\n\n')
}
