// ============================================
// A grid day, kept as a new day block
// ============================================
// The grid offers "Save as a block" on a day that is not from the agency's
// catalog (operator, 2026-10-10): blocks only came from the spreadsheet
// import, so a day built once by hand had to be re-typed into the sheet.
//
// blockDraftFromGridDay reads the block back out of the day — the same
// fields applyBlockToGridDay (grid-apply.ts) reads to rebuild a day, so the
// block lays the day down again: the entrance fees' names as attractions
// (the library resolves them through its aliases), the guide, the meals at
// a restaurant, the night, and the airport and hotel assistance. The operator
// checks it in a short form and gives it a code; validateNewBlock is the
// server's check of what comes back.
//
// Pure: the dialog, the route and the tests share it.

import { DAY_TYPES, GUIDES, NIGHTS, type BlockDayType, type BlockGuide, type BlockMeals, type BlockNight, type DayBlock } from '@/lib/day-blocks/blocks'
import { resolveComponents } from '@/app/pricing-grid/lib/grid-completeness'
import type { GridDay } from '@/app/pricing-grid/types'

const names = (day: GridDay, slotId: string): string[] =>
  day.slots.find(s => s.slotId === slotId)?.selectedItems.map(i => i.name.trim()).filter(Boolean) ?? []

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/** A transport option's name without its vehicle: "Van (8-12 pax) — Cairo Day Tour" → "Cairo Day Tour". */
const routeName = (name: string) => name.replace(/^.*?\(\d+-\d+ pax\)\s*—\s*/, '').trim()

export function blockDraftFromGridDay(day: GridDay, nextDay?: GridDay | null): DayBlock {
  const comps = resolveComponents(day)
  const dayType: BlockDayType = (DAY_TYPES as readonly string[]).includes(day.dayType ?? '') ? (day.dayType as BlockDayType) : 'tour'
  const city = day.city.trim() || null
  const nextCity = nextDay?.city.trim() || null
  const moves = (comps.intercity === 'road' || comps.intercity === 'flight' || dayType === 'transfer') &&
    !!nextCity && norm(nextCity) !== norm(city)

  const night: BlockNight = dayType === 'departure' || !comps.overnight ? 'none'
    : dayType === 'cruise' ? 'on_board'
    : moves ? 'move'
    : 'same'

  const guides = names(day, 'guide')
  const guide: BlockGuide = guides.length === 0 ? 'none'
    : guides.some(g => /assistant|meet/i.test(g)) ? 'assistant'
    : guides.some(g => /spot/i.test(g)) ? 'spot'
    : 'egyptologist'

  const mealNames = names(day, 'meals')
  const meal = (re: RegExp) => mealNames.some(m => re.test(m))
    ? { included: true, venue: 'restaurant' }
    : { included: false, venue: null }
  const meals: BlockMeals = { breakfast: meal(/breakfast/i), lunch: meal(/lunch/i), dinner: meal(/dinner/i) }

  const routes = names(day, 'route').map(routeName)
  const transport = comps.intercity === 'flight' ? 'Flight' : routes.length ? [...new Set(routes)].join('; ') : null

  const assistance: string[] = []
  if (comps.airportArrival) assistance.push('airport arrival')
  if (comps.airportDeparture) assistance.push('airport departure')
  if (comps.hotelCheckIn) assistance.push('hotel check-in')
  if (comps.hotelCheckOut) assistance.push('hotel check-out')

  return {
    code: '',
    name: day.title.trim(),
    shorthand: [],
    day_type: dayType,
    city,
    to_city: night === 'move' ? nextCity : null,
    night,
    night_place: null,
    attractions: [...new Set(names(day, 'entrance_fees'))],
    photo_stops: [],
    guide,
    meals,
    transport,
    assistance,
    optional_extras: [],
    description: day.description.trim() || null,
    notes: null,
    source: 'Pricing grid',
  }
}

/** A block code as stored: upper case, spaces as dashes (blocks.ts). */
export const blockCode = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '-').slice(0, 40)

/** A code for the draft that no block has yet: CAI-TOUR, CAI-TOUR-2 … */
export function suggestBlockCode(draft: Pick<DayBlock, 'city' | 'day_type'>, taken: readonly string[]): string {
  const place = (draft.city ?? 'DAY').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'DAY'
  const base = `${place}-${draft.day_type.toUpperCase()}`
  const used = new Set(taken.map(c => c.toUpperCase()))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

const list = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(s => String(s ?? '').trim()).filter(Boolean))].slice(0, 40) : []
const textOrNull = (v: unknown, max: number): string | null => {
  const t = String(v ?? '').trim()
  return t ? t.slice(0, max) : null
}

export type NewBlockCheck = { ok: true; block: DayBlock } | { ok: false; error: string }

/** What the "Save as a block" form sent, checked as the sheet import checks a row. */
export function validateNewBlock(input: Record<string, unknown>): NewBlockCheck {
  const code = blockCode(input.code)
  const name = textOrNull(input.name, 200)
  if (!code) return { ok: false, error: 'Give the block a code.' }
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return { ok: false, error: 'The code may hold letters, digits, dashes and underscores.' }
  if (!name) return { ok: false, error: 'Give the block a name.' }
  const dayType = String(input.day_type ?? '')
  if (!(DAY_TYPES as readonly string[]).includes(dayType)) return { ok: false, error: `Day type must be one of ${DAY_TYPES.join(', ')}.` }
  const night = String(input.night ?? '')
  if (!(NIGHTS as readonly string[]).includes(night)) return { ok: false, error: `Night must be one of ${NIGHTS.join(', ')}.` }
  const guide = String(input.guide ?? 'none')
  if (!(GUIDES as readonly string[]).includes(guide)) return { ok: false, error: `Guide must be one of ${GUIDES.join(', ')}.` }
  const toCity = textOrNull(input.to_city, 100)
  if (night === 'move' && !toCity) return { ok: false, error: 'The night moves: say to which city.' }

  const rawMeals = (input.meals && typeof input.meals === 'object' ? input.meals : {}) as Record<string, { included?: unknown; venue?: unknown } | undefined>
  const meals = {} as BlockMeals
  for (const m of ['breakfast', 'lunch', 'dinner'] as const) {
    const included = rawMeals[m]?.included === true
    meals[m] = { included, venue: included ? textOrNull(rawMeals[m]?.venue, 60) : null }
  }

  return {
    ok: true,
    block: {
      code,
      name,
      shorthand: list(input.shorthand),
      day_type: dayType as BlockDayType,
      city: textOrNull(input.city, 100),
      to_city: night === 'move' ? toCity : null,
      night: night as BlockNight,
      night_place: night === 'included' ? textOrNull(input.night_place, 100) : null,
      attractions: list(input.attractions),
      photo_stops: list(input.photo_stops),
      guide: guide as BlockGuide,
      meals,
      transport: textOrNull(input.transport, 200),
      assistance: list(input.assistance),
      optional_extras: list(input.optional_extras),
      description: textOrNull(input.description, 4000),
      notes: textOrNull(input.notes, 2000),
      source: textOrNull(input.source, 100),
    },
  }
}
