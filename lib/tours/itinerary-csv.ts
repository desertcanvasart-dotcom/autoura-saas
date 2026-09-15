// ============================================
// The tour days CSV — a template's itinerary, editable in a spreadsheet
// ============================================
// The template sheet (template-csv.ts) carries a tour's flat metadata. It
// cannot carry the itinerary: a day has a city, meals, attractions, a travel
// mode and five service flags, and nesting that inside a CSV cell makes a file
// nobody can edit by hand. So a tour imported from a sheet arrived with its
// day-by-day narrative in Long Description and NO day structure at all — and
// nights, meals and transport are counted from the structure, never from the
// Duration fields (#414).
//
// So the days get their own sheet: one ROW per day, the shape a spreadsheet is
// actually good at. Same decision, and the same shape, as the supplier
// properties sheet (#402).
//
// ── Identity ────────────────────────────────────────────────────────────────
// (Template Code, Day). A day lives inside the template's JSONB array and has
// no id of its own, so there is nothing else to key on.
//
// ── REPLACE, not merge, and why the contiguity rule exists ──────────────────
// The itinerary is ONE value, not a table of rows, so "update day 2 and leave
// the rest" is not a thing the storage can express honestly. A sheet therefore
// REPLACES the days of every template it mentions. Templates it does not
// mention are untouched.
//
// That makes a truncated sheet dangerous — upload days 1–2 of a 4-day tour and
// days 3 and 4 would be gone. So the days for one template must be a
// contiguous run starting at 1. A sheet that skips or restarts numbering is
// REFUSED, which turns the destructive accident into an error message.
//
// ── Meal statuses, and what the pricing engine does with each ───────────────
// included  in the hotel/cruise rate (board basis) — no separate line
// external  the operator takes them to a restaurant — priced per pax from
//           meal rates (lunch and dinner only; see the breakfast refusal)
// none      not provided — the customer's own arrangement
// 'external' is a COST. "Own expense" is 'none'.
//
// ── What this sheet will never carry ────────────────────────────────────────
// attraction_ids and transport_rate_id: UUIDs into this install's own rows.
// They do not survive a move between installs, and a wrong id is worse than an
// absent one. Attractions travel as NAMES, which is what the day editor shows.

export type DayCsvKind = 'text' | 'int' | 'bool' | 'list'

export interface DayCsvColumn {
  name: string
  label: string
  required?: boolean
  kind?: DayCsvKind
  /** Values this cell accepts, lower-cased. Anything else is refused. */
  allowed?: readonly string[]
}

const MEALS = ['included', 'external', 'none'] as const
const ACCOMMODATION = ['hotel', 'cruise', 'none'] as const
const TRANSPORT = ['road', 'flight', 'train', 'sleeping_train'] as const

export const DAY_CSV_COLUMNS: readonly DayCsvColumn[] = [
  { name: 'template_code', label: 'Template Code', required: true },
  { name: 'day', label: 'Day', required: true, kind: 'int' },
  { name: 'title', label: 'Title' },
  { name: 'city', label: 'City' },
  { name: 'accommodation_type', label: 'Accommodation', allowed: ACCOMMODATION },
  { name: 'breakfast', label: 'Breakfast', allowed: MEALS },
  { name: 'lunch', label: 'Lunch', allowed: MEALS },
  { name: 'dinner', label: 'Dinner', allowed: MEALS },
  { name: 'attractions', label: 'Attractions', kind: 'list' },
  { name: 'transport_type', label: 'Transport', allowed: TRANSPORT },
  { name: 'airport_arrival', label: 'Airport Arrival', kind: 'bool' },
  { name: 'airport_departure', label: 'Airport Departure', kind: 'bool' },
  { name: 'hotel_checkin', label: 'Hotel Check-in', kind: 'bool' },
  { name: 'hotel_checkout', label: 'Hotel Check-out', kind: 'bool' },
  { name: 'guide_required', label: 'Guide', kind: 'bool' },
  { name: 'description', label: 'Description' },
]

const csvCell = (v: unknown): string => {
  const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** One row per day, for the templates given. */
export function serializeDaysCsv(
  templates: Array<{ template_code: string; itinerary?: unknown }>,
): string {
  const header = DAY_CSV_COLUMNS.map(c => c.label).join(',')
  const rows: string[] = []

  for (const t of templates) {
    const days = Array.isArray(t.itinerary) ? t.itinerary : []
    days.forEach((raw: unknown, i: number) => {
      const d = (raw ?? {}) as Record<string, unknown>
      const meals = (d.meals ?? {}) as Record<string, unknown>
      const services = (d.services ?? {}) as Record<string, unknown>
      const flat: Record<string, unknown> = {
        template_code: t.template_code,
        day: d.day ?? i + 1,
        title: d.title ?? '',
        city: d.city ?? '',
        accommodation_type: d.accommodation_type ?? 'none',
        breakfast: meals.breakfast ?? 'none',
        lunch: meals.lunch ?? 'none',
        dinner: meals.dinner ?? 'none',
        attractions: Array.isArray(d.attractions) ? d.attractions : [],
        // Absent transport_type has always meant road; write it so the sheet
        // says what the day does rather than leaving the reader to know that.
        transport_type: d.transport_type ?? 'road',
        airport_arrival: !!services.airport_arrival,
        airport_departure: !!services.airport_departure,
        hotel_checkin: !!services.hotel_checkin,
        hotel_checkout: !!services.hotel_checkout,
        guide_required: !!services.guide_required,
        description: d.description ?? '',
      }
      rows.push(
        DAY_CSV_COLUMNS.map(c =>
          c.kind === 'bool' ? csvCell(flat[c.name] ? 'true' : 'false') : csvCell(flat[c.name]),
        ).join(','),
      )
    })
  }

  return [header, ...rows].join('\n') + '\n'
}

/** The sheet to start from: a two-day tour with the columns filled in. */
export function sampleDaysCsv(): string {
  return serializeDaysCsv([{
    template_code: 'EXAMPLE-REPLACE-THIS-CODE',
    itinerary: [
      {
        day: 1, title: 'Arrival and Old Cairo', city: 'Cairo',
        accommodation_type: 'hotel',
        meals: { breakfast: 'none', lunch: 'none', dinner: 'included' },
        attractions: ['Khan el-Khalili'],
        transport_type: 'road',
        services: { airport_arrival: true, airport_departure: false, hotel_checkin: true, hotel_checkout: false, guide_required: true },
        description: 'Airport pickup, hotel check-in, evening walk.',
      },
      {
        day: 2, title: 'Pyramids and Egyptian Museum', city: 'Giza',
        accommodation_type: 'hotel',
        meals: { breakfast: 'included', lunch: 'included', dinner: 'none' },
        attractions: ['Giza Plateau', 'Egyptian Museum'],
        transport_type: 'road',
        services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
        description: 'Giza in the morning, the museum after lunch.',
      },
    ],
  }])
}

export interface DayCsvRecord {
  template_code: string
  day: number
  [k: string]: unknown
}

export interface DaysCsvParseResult {
  /** Day arrays ready to store, keyed by template_code. */
  byTemplate: Map<string, Array<Record<string, unknown>>>
  refused: Array<{ row: number; reason: string }>
  exampleRows: number
  ignoredHeaders: string[]
  parseError?: string
  headerError?: string
}

const HEADER_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const c of DAY_CSV_COLUMNS) {
    m[slug(c.label)] = c.name
    m[c.name] = c.name
  }
  m['code'] = 'template_code'
  m['tour_code'] = 'template_code'
  m['day_number'] = 'day'
  return m
})()

const truthy = (v: string) => ['true', '1', 'yes', 'y'].includes(v.trim().toLowerCase())

/**
 * Parse a days sheet into per-template day arrays, in the shape
 * tour_templates.itinerary stores.
 */
export function parseDaysCsv(
  csvData: string,
  parse: (csv: string) => { data: Array<Record<string, string>>; errors: Array<{ message: string }> },
): DaysCsvParseResult {
  const empty = { byTemplate: new Map(), refused: [], exampleRows: 0, ignoredHeaders: [] }
  const parsed = parse(csvData)
  if (parsed.errors.length > 0) return { ...empty, parseError: parsed.errors[0].message }

  const headers = Object.keys(parsed.data[0] ?? {})
  if (headers.length > 0) {
    const mapped = new Set(headers.map(h => HEADER_MAP[slug(h)]).filter(Boolean))
    const missing = DAY_CSV_COLUMNS.filter(c => c.required && !mapped.has(c.name)).map(c => c.label)
    if (missing.length > 0) {
      return {
        ...empty,
        headerError:
          `The header row is missing ${missing.length === 1 ? 'a required column' : 'required columns'}: ` +
          `${missing.join(', ')}. It has: ${headers.join(', ')}. ` +
          `Download a fresh Sample Days CSV to see the header this expects.`,
      }
    }
  }

  const ignoredHeaders = headers.filter(h => !HEADER_MAP[slug(h)])
  const refused: Array<{ row: number; reason: string }> = []
  let exampleRows = 0
  const rowsByCode = new Map<string, Array<{ row: number; rec: Record<string, unknown> }>>()

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2
    const rec: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_MAP[slug(header)]
      if (!field) continue
      const v = (value ?? '').trim()
      if (v === '') continue
      const col = DAY_CSV_COLUMNS.find(c => c.name === field)!
      if (col.kind === 'int') rec[field] = Number(v)
      else if (col.kind === 'bool') rec[field] = truthy(v)
      else if (col.kind === 'list') rec[field] = v.split(/[;|]/).map(s => s.trim()).filter(Boolean)
      else rec[field] = v
    }

    const code = String(rec.template_code ?? '').trim()
    if (!code) {
      refused.push({ row: rowNum, reason: `row ${rowNum} has no Template Code — every day must say which tour it belongs to` })
      return
    }
    if (/^example[-_]/i.test(code)) { exampleRows++; return }

    const day = rec.day
    if (day == null || !Number.isFinite(day as number) || (day as number) < 1) {
      refused.push({ row: rowNum, reason: `"${code}" row ${rowNum}: Day must be a whole number ≥ 1` })
      return
    }

    // A value outside the allowed set is refused rather than stored: the day
    // editor could not show it, and the engine prices from these words.
    for (const col of DAY_CSV_COLUMNS) {
      if (!col.allowed || rec[col.name] == null) continue
      const v = String(rec[col.name]).trim().toLowerCase()
      if (!col.allowed.includes(v)) {
        refused.push({
          row: rowNum,
          reason: `"${code}" day ${day}: ${col.label} "${rec[col.name]}" is not one of ${col.allowed.join(', ')}`,
        })
        return
      }
      rec[col.name] = v
    }

    // The engine prices an external lunch and dinner from meal rates but has
    // no external-BREAKFAST block: breakfast is assumed to come with the
    // hotel. Accepting 'external' here would store a meal that is silently
    // never priced — worse than refusing it.
    if (rec.breakfast === 'external') {
      refused.push({
        row: rowNum,
        reason: `"${code}" day ${day}: Breakfast cannot be "external" — the engine prices breakfast through the hotel rate only. Use "included" (with the hotel) or "none".`,
      })
      return
    }

    if (!rowsByCode.has(code)) rowsByCode.set(code, [])
    rowsByCode.get(code)!.push({ row: rowNum, rec })
  })

  // Contiguity: a sheet REPLACES a template's days, so a gap or a repeat would
  // silently drop the days it failed to mention. Refuse the whole template
  // rather than write a truncated itinerary.
  const byTemplate = new Map<string, Array<Record<string, unknown>>>()
  for (const [code, rows] of rowsByCode) {
    const days = rows.map(r => r.rec.day as number).sort((a, b) => a - b)
    const expected = Array.from({ length: days.length }, (_, i) => i + 1)
    if (days.join(',') !== expected.join(',')) {
      refused.push({
        row: rows[0].row,
        reason:
          `"${code}": days must be 1 to ${days.length} with no gaps or repeats, but the sheet has ${days.join(', ')}. ` +
          `A days sheet replaces the whole itinerary, so an incomplete one would delete the days it leaves out.`,
      })
      continue
    }
    byTemplate.set(
      code,
      rows
        .sort((a, b) => (a.rec.day as number) - (b.rec.day as number))
        .map(r => toItineraryDay(r.rec)),
    )
  }

  return { byTemplate, refused, exampleRows, ignoredHeaders }
}

/** A flat sheet row in the nested shape tour_templates.itinerary stores. */
export function toItineraryDay(rec: Record<string, unknown>): Record<string, unknown> {
  const day: Record<string, unknown> = {
    day: rec.day,
    title: rec.title ?? '',
    description: rec.description ?? '',
    city: rec.city ?? '',
    accommodation_type: rec.accommodation_type ?? 'none',
    meals: {
      breakfast: rec.breakfast ?? 'none',
      lunch: rec.lunch ?? 'none',
      dinner: rec.dinner ?? 'none',
    },
    attractions: Array.isArray(rec.attractions) ? rec.attractions : [],
    services: {
      airport_arrival: !!rec.airport_arrival,
      airport_departure: !!rec.airport_departure,
      hotel_checkin: !!rec.hotel_checkin,
      hotel_checkout: !!rec.hotel_checkout,
      guide_required: !!rec.guide_required,
    },
  }
  // Absent has always meant road; keep it absent so a re-read matches what the
  // day editor writes, rather than introducing a value it never sets.
  if (rec.transport_type && rec.transport_type !== 'road') {
    day.transport_type = rec.transport_type
  }
  return day
}
