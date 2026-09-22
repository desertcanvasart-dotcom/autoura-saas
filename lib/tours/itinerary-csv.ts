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
//           meal rates. ANY meal, breakfast included.
// none      not provided — the customer's own arrangement
// 'external' is a COST. "Own expense" is 'none'.
// EVERY meal on EVERY day must be stated. A blank cell is refused, not read as
// 'none': an itinerary that has not said where lunch is, is badly written, and
// a cost line is never inferred.
//
// ── What this sheet will never carry ────────────────────────────────────────
// attraction_ids and transport_rate_id: UUIDs into this install's own rows.
// They do not survive a move between installs, and a wrong id is worse than an
// absent one. Attractions travel as NAMES, which is what the day editor shows.

export type DayCsvKind = 'text' | 'int' | 'bool' | 'list'

import { readDayMeals } from '@/lib/tours/day-meals'
import { namesSeveralPlaces, severalPlacesReason } from '@/lib/tours/day-city'
import { sightseeingStatement, SIGHTSEEING_NOT_STATED } from '@/lib/tours/day-sightseeing'
import { sanitizeLegPlace, sanitizeLegAssist } from '@/lib/pricing/flight-leg'

/** A stated yes/no, or blank for "not stated". */
const yesNo = (v: boolean | undefined): string => (v === true ? 'yes' : v === false ? 'no' : '')

export interface DayCsvColumn {
  name: string
  label: string
  required?: boolean
  kind?: DayCsvKind
  /** Values this cell accepts, lower-cased. Anything else is refused. */
  allowed?: readonly string[]
}

const MEALS = ['included', 'external', 'none'] as const
// 'in_the_air' = the overnight flight out: nothing is sold on the day
// (lib/pricing/flight-leg.ts isInTransit). It is a night, so it lives here.
const ACCOMMODATION = ['hotel', 'cruise', 'none', 'in_the_air'] as const
const TRANSPORT = ['road', 'flight', 'train', 'sleeping_train'] as const
const YES_NO = ['yes', 'no'] as const

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
  // A ticket leg's OWN route, when it is not "yesterday's city → today's" — a
  // connection on the arrival day (lib/pricing/flight-leg.ts). Blank = the
  // usual route. Assistance is yes / no; blank = the day's default (on for an
  // arrival-day connection, off on any other flight day) — so it is a word,
  // not a true/false cell, which cannot say "not stated".
  { name: 'leg_from', label: 'Leg From' },
  { name: 'leg_to', label: 'Leg To' },
  { name: 'leg_assist_from', label: 'Assist At Departure', allowed: YES_NO },
  { name: 'leg_assist_to', label: 'Assist At Arrival', allowed: YES_NO },
  // Road beside a ticket, or no vehicle on a road day (sibling #447). Blank =
  // as always. Boarding / leaving the ship: blank = derived from the nights.
  { name: 'road_transfers', label: 'Road Transfers', allowed: YES_NO },
  { name: 'cruise_embark', label: 'Cruise Boarding Assist', allowed: YES_NO },
  { name: 'cruise_disembark', label: 'Cruise Leaving Assist', allowed: YES_NO },
  { name: 'airport_arrival', label: 'Airport Arrival', kind: 'bool' },
  { name: 'airport_departure', label: 'Airport Departure', kind: 'bool' },
  { name: 'hotel_checkin', label: 'Hotel Check-in', kind: 'bool' },
  { name: 'hotel_checkout', label: 'Hotel Check-out', kind: 'bool' },
  { name: 'guide_required', label: 'Guide', kind: 'bool' },
  // A day must SAY whether it has sightseeing (lib/tours/day-sightseeing.ts).
  // Attractions or Guide = true say yes; 'none' here says no. Every bool above
  // exports as "false" and a blank imports as false, so without this column a
  // round trip turned a day nobody had described into a day that "says" it has
  // no guide — and the gap the engine records for it quietly disappeared.
  { name: 'sightseeing', label: 'Sightseeing', allowed: ['none'] },
  // A transfer to somewhere else in town that is not sightseeing: the sound &
  // light show, the market, an evening out (operator, 2026-09-18).
  { name: 'city_transfer', label: 'Local Transfer', kind: 'bool' },
  // Four hours, eight, or twelve — priced as different transport routes.
  { name: 'sightseeing_length', label: 'Sightseeing Length', allowed: ['half_day', 'day_tour', 'long_day_tour'] },
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
      // Both meal shapes, one reader: a legacy ARRAY of meals used to export
      // as three "none" cells, so a re-import turned a day of real meals into
      // a day of nothing (lib/tours/day-meals.ts).
      const meals = readDayMeals(d.meals as never) as unknown as Record<string, unknown>
      const services = (d.services ?? {}) as Record<string, unknown>
      const flat: Record<string, unknown> = {
        template_code: t.template_code,
        day: d.day ?? i + 1,
        title: d.title ?? '',
        city: d.city ?? '',
        // An UNSTATED night exports blank, not 'none'. Writing 'none' made a
        // re-import say "this day has no bed", which silently removed the
        // hotel from pricing — the opposite of what the blank meant.
        accommodation_type: d.in_transit === true ? 'in_the_air' : (d.accommodation_type ?? ''),
        breakfast: meals.breakfast ?? 'none',
        lunch: meals.lunch ?? 'none',
        dinner: meals.dinner ?? 'none',
        attractions: Array.isArray(d.attractions) ? d.attractions : [],
        // Absent transport_type has always meant road; write it so the sheet
        // says what the day does rather than leaving the reader to know that.
        transport_type: d.transport_type ?? 'road',
        leg_from: sanitizeLegPlace(d.leg_from) ?? '',
        leg_to: sanitizeLegPlace(d.leg_to) ?? '',
        leg_assist_from: yesNo(sanitizeLegAssist(d.leg_assist)?.from),
        leg_assist_to: yesNo(sanitizeLegAssist(d.leg_assist)?.to),
        road_transfers: yesNo(typeof d.road_transfers === 'boolean' ? d.road_transfers : undefined),
        cruise_embark: yesNo(typeof services.cruise_embark === 'boolean' ? services.cruise_embark : undefined),
        cruise_disembark: yesNo(typeof services.cruise_disembark === 'boolean' ? services.cruise_disembark : undefined),
        airport_arrival: !!services.airport_arrival,
        airport_departure: !!services.airport_departure,
        hotel_checkin: !!services.hotel_checkin,
        hotel_checkout: !!services.hotel_checkout,
        guide_required: !!services.guide_required,
        // 'none' for a day that SAYS so — the editor's tick, or a services
        // block written without a guide (an arrival, a departure). Blank for a
        // day with attractions or a guide (they say it themselves), and blank
        // for a day that says nothing: a re-import must not invent the answer.
        sightseeing: sightseeingStatement(d) === 'none' ? 'none' : '',
        city_transfer: !!d.city_transfer,
        sightseeing_length: d.sightseeing_length ?? '',
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

/**
 * The one tour both sample sheets describe. The template sample and the days
 * sample must agree — same code, same length, same meals — or a person using
 * them "exactly as they are" imports a one-day tour whose itinerary claims
 * hotel nights. The template sample's Meals Included cell is DERIVED from
 * this fixture (template-csv.ts), so the two cannot drift apart.
 */
export const SAMPLE_TOUR_DAYS = [
  {
    day: 1, title: 'Giza Pyramids and Egyptian Museum', city: 'Giza',
    // A day tour: no bed tonight, so no hotel night for the engine to count.
    accommodation_type: 'none',
    // Lunch is in the template sample's Inclusions — on a day tour that is a
    // restaurant, priced per pax. The other two are stated as not provided.
    meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
    attractions: ['Giza Plateau', 'Egyptian Museum'],
    services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
    description: 'Giza Plateau in the morning, lunch, then the Egyptian Museum.',
  },
] as const

/** The sheet to start from: the sample tour's day, every column filled in. */
export function sampleDaysCsv(): string {
  return serializeDaysCsv([{ template_code: 'EXAMPLE-REPLACE-THIS-CODE', itinerary: SAMPLE_TOUR_DAYS }])
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

  // A sheet made before the Sightseeing column existed cannot be held to it.
  const hasSightseeingColumn = headers.some(h => HEADER_MAP[slug(h)] === 'sightseeing')
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
      // A BLANK is not a wrong value: for the night it means the day does not
      // say, which the engine then infers as it always has. Only meals refuse
      // a blank, and they refuse it below, with their own reason.
      if (v === '') continue
      if (!col.allowed.includes(v)) {
        refused.push({
          row: rowNum,
          reason: `"${code}" day ${day}: ${col.label} "${rec[col.name]}" is not one of ${col.allowed.join(', ')}`,
        })
        return
      }
      rec[col.name] = v
    }

    // A day is in ONE city. "Cairo; Luxor" is how 21 live days arrived, and
    // not one rate could be found for them — see lib/tours/day-city.ts for why
    // the list is refused rather than read by position.
    if (namesSeveralPlaces(rec.city)) {
      refused.push({ row: rowNum, reason: `"${code}" day ${day}: ${severalPlacesReason(rec.city)}` })
      return
    }

    // A leg belongs to a day that travels by ticket; airport assistance to one
    // that FLIES. Said on a road day it would be stored and never priced.
    const mode = rec.transport_type && rec.transport_type !== 'road' ? String(rec.transport_type) : ''
    if ((rec.leg_from || rec.leg_to) && !mode) {
      refused.push({ row: rowNum, reason: `"${code}" day ${day}: Leg From / Leg To name a ticket's route, but Transport is road — set Transport to flight, train or sleeping_train, or clear them` })
      return
    }
    if ((rec.leg_assist_from || rec.leg_assist_to) && mode !== 'flight') {
      refused.push({ row: rowNum, reason: `"${code}" day ${day}: Assist At Departure / Arrival is airport assistance, and the day does not fly — set Transport to flight, or clear them` })
      return
    }

    // A day says whether it has sightseeing — the meals rule, applied to the
    // other thing a day's price hangs on. Only for a sheet that HAS the column:
    // an older file imports exactly as it did.
    const namesAttractions = Array.isArray(rec.attractions) && rec.attractions.length > 0
    if (rec.sightseeing === 'none' && (namesAttractions || rec.guide_required === true)) {
      refused.push({
        row: rowNum,
        reason: `"${code}" day ${day}: Sightseeing says "none" but the day ${namesAttractions ? 'lists attractions' : 'asks for a guide'} — it cannot be both`,
      })
      return
    }
    // (A day in the air has said everything: nothing on it is sold.)
    if (hasSightseeingColumn && rec.accommodation_type !== 'in_the_air' && !namesAttractions && rec.guide_required !== true && rec.sightseeing !== 'none') {
      refused.push({
        row: rowNum,
        reason: `"${code}" day ${day} ${SIGHTSEEING_NOT_STATED}. List its Attractions, set Guide to true, or put "none" in Sightseeing`,
      })
      return
    }

    // THE RULE: every meal on every day is stated — hotel (included),
    // restaurant (external), or none. A blank is not 'none'; it is an
    // itinerary that has not said, and a cost line cannot be left unsaid.
    for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
      if (rec[slot] == null) {
        refused.push({
          row: rowNum,
          reason: `"${code}" day ${day}: ${slot[0].toUpperCase() + slot.slice(1)} is not stated — every meal must be included (hotel), external (restaurant), or none`,
        })
        return
      }
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
    // Blank means the day does not say, which is not the same as saying "no
    // night". Left unset, the engine infers it as it always has; written as
    // 'none' it would remove the bed.
    // 'in_the_air' is a flag on the DAY, stored as the editor stores it.
    ...(rec.accommodation_type === 'in_the_air'
      ? { accommodation_type: 'none', in_transit: true, overnight_kind: 'flight' }
      : rec.accommodation_type ? { accommodation_type: rec.accommodation_type } : {}),
    ...(rec.city_transfer ? { city_transfer: true } : {}),
    ...(rec.sightseeing_length ? { sightseeing_length: rec.sightseeing_length } : {}),
    ...(rec.sightseeing === 'none' ? { sightseeing: 'none' } : {}),
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
      ...(rec.cruise_embark ? { cruise_embark: rec.cruise_embark === 'yes' } : {}),
      ...(rec.cruise_disembark ? { cruise_disembark: rec.cruise_disembark === 'yes' } : {}),
    },
    ...(rec.road_transfers ? { road_transfers: rec.road_transfers === 'yes' } : {}),
  }
  // Absent has always meant road; keep it absent so a re-read matches what the
  // day editor writes, rather than introducing a value it never sets.
  if (rec.transport_type && rec.transport_type !== 'road') {
    day.transport_type = rec.transport_type
    const from = sanitizeLegPlace(rec.leg_from), to = sanitizeLegPlace(rec.leg_to)
    if (from) day.leg_from = from
    if (to) day.leg_to = to
    const assist = sanitizeLegAssist({
      ...(rec.leg_assist_from ? { from: rec.leg_assist_from === 'yes' } : {}),
      ...(rec.leg_assist_to ? { to: rec.leg_assist_to === 'yes' } : {}),
    })
    if (assist && rec.transport_type === 'flight') day.leg_assist = assist
  }
  return day
}
