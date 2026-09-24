// ============================================
// Periods-format CSV: one row per CONTRACT PERIOD (2026-09-05)
// ============================================
// The flat bulk format is one row per property with fixed season columns —
// the OLD model. Since the period model became the one way to price
// (#323), the natural rate sheet is one row per dated window:
//
//   Service Code, Property Name, Period Name, Season, From, To,
//   PP Double (EU passport), Single Supp (EU passport), Triple Red (…),
//   …same for non-EU…, Guide Bed / Night
//
// The first real upload of exactly this shape bounced 9/9 rows with
// "Property Name is required" — the flat importer read label-headers it
// didn't know. This module understands the shape: rows group by property,
// become RateSeason periods (capped at MAX six), and the importer UPDATES
// the existing property's periods. It never creates a property: a rate
// sheet without a city and tier would be an unpriceable ghost, so an
// unknown code/name is a refusal naming the fix.

import { MAX_RATE_PERIODS, sanitizeSeasons, legacyColumnMirror, type RateSeason, type RateSeasonEntity } from '@/lib/rates/rate-seasons'

const RATE_FIELD_HEADERS: Record<string, string> = {
  'pp double (eu passport)': 'ppd_eur',
  'pp double': 'ppd_eur',
  'ppd (eu passport)': 'ppd_eur',
  'ppd': 'ppd_eur',
  'single supp (eu passport)': 'single_supplement_eur',
  'single supp': 'single_supplement_eur',
  'triple red (eu passport)': 'triple_reduction_eur',
  'triple red': 'triple_reduction_eur',
  'pp double (non-eu passport)': 'ppd_non_eur',
  'ppd (non-eu passport)': 'ppd_non_eur',
  'single supp (non-eu passport)': 'single_supplement_non_eur',
  'triple red (non-eu passport)': 'triple_reduction_non_eur',
  'guide bed / night': 'guide_rate_eur',
  'guide bed': 'guide_rate_eur',
  'guide cabin / night': 'guide_rate_eur',
}

const IDENTITY_HEADERS: Record<string, string> = {
  'service code': 'service_code',
  'cruise code': 'service_code',
  'property name': 'property_name',
  'ship name': 'property_name',
  'hotel name': 'property_name',
  'period name': 'name',
  // The season word (sibling #452): a key or a label of the agency's
  // rate_season vocabulary; resolved to the key by the import route.
  'season': 'season',
  'from': 'from',
  'to': 'to',
}

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ')

function mapHeader(h: string): string | null {
  const n = normalizeHeader(h)
  return IDENTITY_HEADERS[n] ?? RATE_FIELD_HEADERS[n] ?? null
}

/** True when this file is the periods shape: dated windows + a PPD column.
 *  The flat format's headers (property_name, pp_double_eur, …) map to none
 *  of these, so the two shapes cannot be confused. */
export function detectPeriodsCsv(headers: string[]): boolean {
  const mapped = new Set(headers.map(mapHeader).filter(Boolean))
  return mapped.has('from') && mapped.has('to') && mapped.has('ppd_eur') &&
    (mapped.has('service_code') || mapped.has('property_name'))
}

export interface PeriodsCsvGroup {
  /** Grouping key — the service code when present, else the lowercased name. */
  key: string
  service_code: string | null
  property_name: string | null
  periods: RateSeason[]
  rows: number[]
}

export interface PeriodsCsvParse {
  groups: PeriodsCsvGroup[]
  errors: Array<{ row: number; column: string; message: string }>
  totalRows: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parsePeriodsCsv(rows: Array<Record<string, string>>): PeriodsCsvParse {
  const errors: PeriodsCsvParse['errors'] = []
  const byKey = new Map<string, PeriodsCsvGroup>()

  rows.forEach((raw, i) => {
    const rowNum = i + 2 // header is row 1
    const rec: Record<string, string> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = mapHeader(header)
      if (field) rec[field] = (value ?? '').trim()
    }

    const code = rec.service_code || ''
    const name = rec.property_name || ''
    if (!code && !name) {
      errors.push({ row: rowNum, column: 'service_code', message: 'Row names neither a Service Code nor a Property Name' })
      return
    }
    const from = rec.from || ''
    const to = rec.to || ''
    // The export lists a property with no periods yet as one line with the
    // dates and prices blank. Read back, that line says nothing: skip it —
    // it must neither fail the file nor wipe anything.
    const saysNothing = !from && !to && !rec.name && !rec.season &&
      Object.keys(RATE_FIELD_HEADERS).every(h => !rec[RATE_FIELD_HEADERS[h]])
    if (saysNothing) return
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      errors.push({ row: rowNum, column: 'from', message: `"${name || code}": From/To must be real dates (YYYY-MM-DD) — got "${from}" → "${to}"` })
      return
    }
    if (to < from) {
      errors.push({ row: rowNum, column: 'to', message: `"${name || code}": period ends (${to}) before it starts (${from})` })
      return
    }

    const num = (v: string | undefined) => {
      if (v === undefined || v === '') return 0
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : NaN
    }
    const rates: Record<string, number> = {
      ppd_eur: num(rec.ppd_eur),
      single_supplement_eur: num(rec.single_supplement_eur),
      triple_reduction_eur: num(rec.triple_reduction_eur),
      ppd_non_eur: num(rec.ppd_non_eur) || num(rec.ppd_eur),
      single_supplement_non_eur: num(rec.single_supplement_non_eur) || num(rec.single_supplement_eur),
      triple_reduction_non_eur: num(rec.triple_reduction_non_eur) || num(rec.triple_reduction_eur),
      guide_rate_eur: num(rec.guide_rate_eur),
    }
    const bad = Object.entries(rates).find(([, v]) => Number.isNaN(v))
    if (bad) {
      errors.push({ row: rowNum, column: bad[0], message: `"${name || code}": ${bad[0]} is not a non-negative number` })
      return
    }

    const key = code || name.toLowerCase()
    let group = byKey.get(key)
    if (!group) {
      group = { key, service_code: code || null, property_name: name || null, periods: [], rows: [] }
      byKey.set(key, group)
    }
    // Later rows may fill in what the first lacked (a code-only row after a
    // named one, or vice versa).
    if (!group.service_code && code) group.service_code = code
    if (!group.property_name && name) group.property_name = name

    if (group.periods.length >= MAX_RATE_PERIODS) {
      errors.push({
        row: rowNum,
        column: 'period',
        message: `"${name || code}" already has ${MAX_RATE_PERIODS} periods — the model caps at ${MAX_RATE_PERIODS} per rate`,
      })
      return
    }
    group.periods.push({
      name: rec.name || `${from} – ${to}`,
      from,
      to,
      rates,
      ...(rec.season ? { season: rec.season } : {}),
    })
    group.rows.push(rowNum)
  })

  return { groups: [...byKey.values()], errors, totalRows: rows.length }
}

/** Which rate table a periods file may target, and how its rows find their
 *  property. */
export const PERIODS_CSV_TABLES: Record<string, {
  entity: RateSeasonEntity
  codeColumn: string
  nameColumn: string
  createHint: string
}> = {
  accommodation_rates: {
    entity: 'accommodation',
    codeColumn: 'service_code',
    nameColumn: 'property_name',
    createHint: 'create the hotel first (Rates → Hotels → Add Hotel), then re-import its periods',
  },
  nile_cruises: {
    entity: 'cruise',
    codeColumn: 'cruise_code',
    nameColumn: 'ship_name',
    createHint: 'create the cruise first (Rates → Nile Cruises → Add), then re-import its periods',
  },
}

// ============================================
// EXPORT — the same shape, written out (2026-09-24)
// ============================================
// Operator, 2026-09-24: "Hotels are exported and shows only one date period,
// while actually each hotel has five periods." The flat export is one row
// per property with fixed low/high/peak columns, so it carries period 1 and
// nothing else; the periods sheet above could be IMPORTED but was never
// offered for download. This writes it: one row per period, headers this
// module's parser reads back, so export → import is lossless.
//
// Identity columns beyond the code and name (city, tier, board, cabin,
// nights) are there for the person reading the sheet; the importer ignores
// them — the rows find their property by Service Code / Cruise Code.

interface PeriodsSheetSpec {
  codeHeader: string
  nameHeader: string
  /** [header, row column] shown for the reader; ignored on import. */
  context: Array<[string, string]>
  guideHeader: string
}

const PERIODS_SHEET: Record<RateSeasonEntity, PeriodsSheetSpec> = {
  accommodation: {
    codeHeader: 'Service Code',
    nameHeader: 'Property Name',
    context: [['City', 'city'], ['Tier', 'tier'], ['Board', 'board_basis']],
    guideHeader: 'Guide Bed / Night',
  },
  cruise: {
    codeHeader: 'Cruise Code',
    nameHeader: 'Ship Name',
    context: [['Cabin Type', 'cabin_type'], ['Nights', 'duration_nights']],
    guideHeader: 'Guide Cabin / Night',
  },
}

const RATE_EXPORT_HEADERS: Array<[string, string]> = [
  ['PP Double (EU passport)', 'ppd_eur'],
  ['Single Supp (EU passport)', 'single_supplement_eur'],
  ['Triple Red (EU passport)', 'triple_reduction_eur'],
  ['PP Double (non-EU passport)', 'ppd_non_eur'],
  ['Single Supp (non-EU passport)', 'single_supplement_non_eur'],
  ['Triple Red (non-EU passport)', 'triple_reduction_non_eur'],
]

export function periodsSheetHeaders(entity: RateSeasonEntity): string[] {
  const s = PERIODS_SHEET[entity]
  return [
    s.codeHeader, s.nameHeader, ...s.context.map(([h]) => h),
    'Period Name', 'Season', 'From', 'To',
    ...RATE_EXPORT_HEADERS.map(([h]) => h), s.guideHeader,
  ]
}

/** The columns the periods sheet reads from a rate row — named, never `*`. */
export function periodsSheetColumns(entity: RateSeasonEntity, codeColumn: string, nameColumn: string): string[] {
  return [codeColumn, nameColumn, ...PERIODS_SHEET[entity].context.map(([, col]) => col), 'seasons']
}

/**
 * One sheet row per stored period of every rate row. A row with no periods
 * yet still gets ONE line, dates and prices blank, so the sheet lists every
 * property and says plainly which ones have nothing to price from.
 * `seasonLabel` turns a stored season key into the agency's own word.
 */
export function buildPeriodsSheetRows(
  rows: Array<Record<string, unknown>>,
  entity: RateSeasonEntity,
  codeColumn: string,
  nameColumn: string,
  seasonLabel: (key: string) => string = k => k,
): Array<Record<string, string | number>> {
  const s = PERIODS_SHEET[entity]
  const cell = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join('/') : String(v))
  const out: Array<Record<string, string | number>> = []
  for (const row of rows) {
    const identity: Record<string, string> = {
      [s.codeHeader]: cell(row[codeColumn]),
      [s.nameHeader]: cell(row[nameColumn]),
    }
    for (const [h, col] of s.context) identity[h] = cell(row[col])
    const periods = Array.isArray(row.seasons) ? (row.seasons as RateSeason[]) : []
    if (periods.length === 0) {
      out.push({
        ...identity, 'Period Name': '', Season: '', From: '', To: '',
        ...Object.fromEntries(RATE_EXPORT_HEADERS.map(([h]) => [h, ''])), [s.guideHeader]: '',
      })
      continue
    }
    for (const p of periods) {
      const rates = p.rates ?? {}
      out.push({
        ...identity,
        'Period Name': p.name ?? '',
        Season: p.season ? seasonLabel(p.season) : '',
        From: p.from ?? '',
        To: p.to ?? '',
        ...Object.fromEntries(RATE_EXPORT_HEADERS.map(([h, f]) => [h, rates[f] ?? 0])),
        [s.guideHeader]: rates.guide_rate_eur ?? 0,
      })
    }
  }
  return out
}

/**
 * The flat (one row per property) sheet updating an EXISTING hotel/cruise:
 * it may never shrink the periods the row holds. When the row stores more
 * periods than the sheet's row carries, the stored periods stay untouched
 * (`seasons` leaves the update; the price columns mirror period 1) and the
 * counts are returned so the import can say so. null = nothing to protect.
 * (Operator, 2026-09-24: re-importing the export turned five periods into one.)
 */
export function keepStoredPeriods(
  update: Record<string, unknown>,
  storedRaw: unknown,
  entity: RateSeasonEntity,
): { kept: number; incoming: number } | null {
  const storedCount = Array.isArray(storedRaw) ? storedRaw.length : 0
  const incoming = Array.isArray(update.seasons) ? update.seasons.length : 0
  if (storedCount <= incoming) return null
  // Not written at all: the row keeps its periods exactly as stored, byte
  // for byte. Only the price columns are set — from stored period 1 — so the
  // sheet's one-period prices cannot sit beside periods that say otherwise.
  delete update.seasons
  Object.assign(update, legacyColumnMirror(sanitizeSeasons(storedRaw, entity), entity))
  return { kept: storedCount, incoming }
}
