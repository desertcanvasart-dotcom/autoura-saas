// ============================================
// Day blocks — the agency's standard days, read from and written to a sheet
// ============================================
// A block is one standard day kept once (migration 398): "Giza Pyramids &
// GEM", "Alexandria day trip from Cairo", "Fly Cairo to Luxor". The agency
// keeps them in a spreadsheet and imports it; this reads that sheet into
// blocks (and writes blocks back out, so the round trip is the edit path).
//
// The sheet is read forgivingly — the agency's own first draft wrote nights
// as "no", "no stay (back to Cairo)", "move: Aswan", "stay: White Desert
// camp", and a transfer's city as "Luxor > Aswan" — but every value lands on
// one of a few fixed meanings, and a row that cannot is reported, never
// guessed.
//
// Pure: the import route and the tests share it.

export const DAY_TYPES = ['arrival', 'tour', 'transfer', 'cruise', 'free', 'departure'] as const
export type BlockDayType = (typeof DAY_TYPES)[number]

/**
 * Where the traveller sleeps after this day.
 *   same     — the stay goes on; the block books no bed (a day tour, a free day)
 *   move     — the night is in `to_city` (a transfer, a flight)
 *   included — the block includes the night itself, at `night_place` (a camp)
 *   on_board — on the ship
 *   none     — no night (a departure)
 */
export const NIGHTS = ['same', 'move', 'included', 'on_board', 'none'] as const
export type BlockNight = (typeof NIGHTS)[number]

export const GUIDES = ['egyptologist', 'assistant', 'spot', 'none'] as const
export type BlockGuide = (typeof GUIDES)[number]

export interface BlockMeal {
  included: boolean
  /** Where it is served: "restaurant", "ship", "camp" … */
  venue: string | null
}

export interface BlockMeals {
  breakfast: BlockMeal
  lunch: BlockMeal
  dinner: BlockMeal
}

export interface DayBlock {
  code: string
  name: string
  shorthand: string[]
  day_type: BlockDayType
  city: string | null
  to_city: string | null
  night: BlockNight
  night_place: string | null
  attractions: string[]
  photo_stops: string[]
  guide: BlockGuide
  meals: BlockMeals
  transport: string | null
  assistance: string[]
  optional_extras: string[]
  description: string | null
  notes: string | null
  source: string | null
}

// ── Reading the sheet ───────────────────────────────────────────────────────

/** The sheet's columns, in the order an export writes them. */
export const SHEET_COLUMNS = [
  'code', 'name', 'shorthand', 'day type', 'city', 'to city', 'night', 'night place',
  'attractions', 'photo stops', 'guide', 'breakfast', 'lunch', 'dinner',
  'transport', 'assistance', 'optional extras', 'description', 'notes', 'source',
] as const

/** A header as the sheet wrote it → the column it means. "(suggested …)" and
 *  other bracketed notes, case and spacing are ignored. */
const HEADER_ALIASES: Record<string, (typeof SHEET_COLUMNS)[number]> = {
  'code': 'code',
  'name': 'name',
  'shorthand': 'shorthand',
  'shorthand you write': 'shorthand',
  'day type': 'day type',
  'type': 'day type',
  'city': 'city',
  'to city': 'to city',
  'night': 'night',
  'night place': 'night place',
  'attractions': 'attractions',
  'photo stops': 'photo stops',
  'photo stops / no ticket': 'photo stops',
  'guide': 'guide',
  'breakfast': 'breakfast',
  'lunch': 'lunch',
  'dinner': 'dinner',
  'lunch / dinner': 'lunch',
  'transport': 'transport',
  'assistance': 'assistance',
  'airport / hotel assistance': 'assistance',
  'optional extras': 'optional extras',
  'description': 'description',
  'notes': 'notes',
  'source': 'source',
  'from': 'source',
  'from your data': 'source',
}

export function sheetColumn(header: string): (typeof SHEET_COLUMNS)[number] | null {
  const key = header.replace(/\([^)]*\)/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
  return HEADER_ALIASES[key] ?? null
}

const text = (v: unknown): string => String(v ?? '').trim()
const orNull = (v: unknown): string | null => text(v) || null

/** "a; b, c" → ["a", "b", "c"]: either separator, blanks dropped. */
export function listCell(v: unknown): string[] {
  return text(v).split(/[;,]/).map(s => s.trim()).filter(Boolean)
}

function dayType(v: string): BlockDayType | null {
  const t = v.toLowerCase()
  return (DAY_TYPES as readonly string[]).includes(t) ? (t as BlockDayType) : t === '' ? 'tour' : null
}

/** "Luxor > Aswan" (or →, -> ) → ["Luxor", "Aswan"]. */
function cityPair(v: string): [string | null, string | null] {
  const parts = v.split(/\s*(?:>|→|->)\s*/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) return [parts[0], parts[parts.length - 1]]
  // "(same city)" and the like mean: wherever the trip is.
  if (/^\(.*\)$/.test(v)) return [null, null]
  return [parts[0] ?? null, null]
}

/** The night, as written → its meaning. */
function night(v: string): { night: BlockNight; place: string | null } | null {
  const raw = v.trim()
  const t = raw.toLowerCase()
  const after = (prefix: RegExp) => raw.replace(prefix, '').trim() || null
  if (t === '' || t === 'same' || t === 'stay' || /^no\b/.test(t)) return { night: 'same', place: null }
  if (/^move\b/.test(t)) return { night: 'move', place: after(/^move\s*[:\-]?\s*/i) }
  if (/^(stay|included)\s*:/.test(t)) return { night: 'included', place: after(/^(stay|included)\s*:\s*/i) }
  if (t === 'included') return { night: 'included', place: null }
  if (/^on[\s_-]?board\b/.test(t)) return { night: 'on_board', place: null }
  if (t === 'none') return { night: 'none', place: null }
  return null
}

function guide(v: string): BlockGuide | null {
  const t = v.toLowerCase()
  if (t === '' || t === 'no' || t === 'none') return 'none'
  if (t === 'yes' || /egyptolog/.test(t) || t === 'guide') return 'egyptologist'
  if (/assistant/.test(t)) return 'assistant'
  if (/spot/.test(t)) return 'spot'
  return null
}

/** "included (restaurant)" / "none" / "external" → the meal. */
function meal(v: string): BlockMeal | null {
  const raw = v.trim()
  const t = raw.toLowerCase()
  if (t === '' || t === 'none' || t === 'no') return { included: false, venue: null }
  const venue = raw.match(/\(([^)]+)\)/)?.[1]?.trim() || null
  // "external" in the tours export meant an included meal at a restaurant.
  if (/^(included|yes|external)\b/.test(t)) return { included: true, venue: venue ?? (t.startsWith('external') ? 'restaurant' : null) }
  return null
}

export interface SheetRowResult {
  row: number
  block?: DayBlock
  errors: string[]
}

/**
 * One sheet row (header → cell) into a block, or why not. `row` is the
 * sheet's own row number, for the message.
 */
export function blockFromSheetRow(cells: Record<string, unknown>, row: number): SheetRowResult {
  const byColumn: Partial<Record<(typeof SHEET_COLUMNS)[number], string>> = {}
  for (const [header, value] of Object.entries(cells)) {
    const col = sheetColumn(header)
    if (col && byColumn[col] === undefined) byColumn[col] = text(value)
  }
  const errors: string[] = []
  const code = (byColumn.code ?? '').toUpperCase().replace(/\s+/g, '-')
  const name = byColumn.name ?? ''
  if (!code) errors.push('It has no code.')
  if (!name) errors.push('It has no name.')

  const type = dayType(byColumn['day type'] ?? '')
  if (!type) errors.push(`Day type "${byColumn['day type']}" is not one of ${DAY_TYPES.join(', ')}.`)

  const [city, pairTo] = cityPair(byColumn.city ?? '')
  const n = night(byColumn.night ?? '')
  if (!n) errors.push(`Night "${byColumn.night}" is not one of: same, move: <city>, included: <place>, on board, none.`)
  const toCity = orNull(byColumn['to city']) ?? pairTo ?? (n?.night === 'move' ? n.place : null)
  if (n?.night === 'move' && !toCity) errors.push('The night moves, but the sheet does not say to which city.')

  const g = guide(byColumn.guide ?? '')
  if (!g) errors.push(`Guide "${byColumn.guide}" is not one of: yes, no, assistant, spot guide.`)

  const meals = {} as BlockMeals
  for (const m of ['breakfast', 'lunch', 'dinner'] as const) {
    const parsed = meal(byColumn[m] ?? '')
    if (!parsed) errors.push(`${m[0].toUpperCase()}${m.slice(1)} "${byColumn[m]}" is not "included", "included (<where>)" or "none".`)
    meals[m] = parsed ?? { included: false, venue: null }
  }

  if (errors.length > 0) return { row, errors }
  return {
    row,
    errors,
    block: {
      code,
      name,
      shorthand: listCell(byColumn.shorthand),
      day_type: type!,
      city,
      to_city: toCity,
      night: n!.night,
      night_place: n!.night === 'included' ? n!.place : null,
      attractions: listCell(byColumn.attractions),
      photo_stops: listCell(byColumn['photo stops']),
      guide: g!,
      meals,
      transport: orNull(byColumn.transport),
      assistance: listCell(byColumn.assistance),
      optional_extras: listCell(byColumn['optional extras']),
      description: orNull(byColumn.description),
      notes: orNull(byColumn.notes),
      source: orNull(byColumn.source),
    },
  }
}

export interface SheetRead {
  blocks: DayBlock[]
  problems: { row: number; code: string | null; errors: string[] }[]
}

/** Every row of the sheet; a code used twice is reported, the first kept. */
export function blocksFromSheet(rows: readonly Record<string, unknown>[]): SheetRead {
  const blocks: DayBlock[] = []
  const problems: SheetRead['problems'] = []
  const seen = new Set<string>()
  rows.forEach((cells, i) => {
    const rowNumber = i + 2 // the header is row 1
    if (Object.values(cells).every(v => text(v) === '')) return
    const result = blockFromSheetRow(cells, rowNumber)
    if (!result.block) {
      problems.push({ row: rowNumber, code: text(cells.code) || null, errors: result.errors })
      return
    }
    if (seen.has(result.block.code)) {
      problems.push({ row: rowNumber, code: result.block.code, errors: [`Code ${result.block.code} is used on an earlier row too; this row was skipped.`] })
      return
    }
    seen.add(result.block.code)
    blocks.push(result.block)
  })
  return { blocks, problems }
}

// ── Writing the sheet ───────────────────────────────────────────────────────

const mealCell = (m: BlockMeal | undefined) =>
  !m?.included ? 'none' : m.venue ? `included (${m.venue})` : 'included'

const nightCell = (b: Pick<DayBlock, 'night' | 'to_city' | 'night_place'>) =>
  b.night === 'move' ? `move: ${b.to_city ?? ''}`.trim()
    : b.night === 'included' ? (b.night_place ? `included: ${b.night_place}` : 'included')
    : b.night === 'on_board' ? 'on board'
    : b.night

const guideCell = (g: BlockGuide) => (g === 'egyptologist' ? 'yes' : g === 'none' ? 'no' : g === 'spot' ? 'spot guide' : 'assistant')

/** A block as one sheet row, in SHEET_COLUMNS order — what reading it gives back. */
export function sheetRowFromBlock(b: DayBlock): Record<(typeof SHEET_COLUMNS)[number], string> {
  return {
    'code': b.code,
    'name': b.name,
    'shorthand': b.shorthand.join('; '),
    'day type': b.day_type,
    'city': b.city ?? '',
    'to city': b.to_city ?? '',
    'night': nightCell(b),
    'night place': b.night_place ?? '',
    'attractions': b.attractions.join('; '),
    'photo stops': b.photo_stops.join('; '),
    'guide': guideCell(b.guide),
    'breakfast': mealCell(b.meals?.breakfast),
    'lunch': mealCell(b.meals?.lunch),
    'dinner': mealCell(b.meals?.dinner),
    'transport': b.transport ?? '',
    'assistance': b.assistance.join('; '),
    'optional extras': b.optional_extras.join('; '),
    'description': b.description ?? '',
    'notes': b.notes ?? '',
    'source': b.source ?? '',
  }
}

/** How a block's night reads on screen. */
export function nightLabel(b: Pick<DayBlock, 'night' | 'to_city' | 'night_place' | 'city'>): string {
  switch (b.night) {
    case 'same': return 'Stays where you are'
    case 'move': return `Night in ${b.to_city ?? '?'}`
    case 'included': return `Night included${b.night_place ? `: ${b.night_place}` : ''}`
    case 'on_board': return 'On board'
    case 'none': return 'No night'
  }
}
