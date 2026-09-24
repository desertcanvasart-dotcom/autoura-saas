// ============================================
// ONE rate sheet for hotels and cruises: details + every dated period
// ============================================
// Operator, 2026-09-24. A hotel prices from up to six DATED PERIODS
// (lib/rates/rate-seasons.ts); the old flat sheet is one row per property
// with fixed low/high/peak columns, so it exported period 1 and nothing else.
// A second "periods" file fixed the loss but split one hotel over two files,
// and an export of the first still looked like a one-period hotel. His call:
// ONE file.
//
// The shape: one row per PERIOD, the property's details repeated on each of
// its rows —
//
//   service_code, property_name, city, tier, …, rate_currency,
//   period_name, period_season, period_from, period_to,
//   period_pp_double_eur, period_single_supp_eur, period_triple_red_eur,
//   period_pp_double_non_eur, period_single_supp_non_eur,
//   period_triple_red_non_eur, period_guide_rate_eur
//
// A property with no periods yet is one row with the period cells blank.
// Import groups the rows back by the property's key (service_code /
// cruise_code), takes the details once — refusing a property whose rows
// disagree on a detail, rather than guessing which row is right — and gives
// it exactly the periods the file lists. So one file creates a new hotel
// with all its periods, or updates an existing one.
//
// The old low/high/peak price and date columns are NOT in this sheet: the
// periods ARE those prices now. Old flat files still import as before
// (bulk-rate-service deriveImportSeasons), and so do old periods files
// (periods-csv.ts).

import type { RateTableConfig } from '@/lib/bulk-rate-service'
import { parsePeriodsCsv, type PeriodsCsvParse } from '@/lib/rates/periods-csv'
import type { RateSeason, RateSeasonEntity } from '@/lib/rates/rate-seasons'

/** The flat columns the periods replace, per table — left out of the sheet. */
const PERIOD_CARRIED: Record<string, ReadonlySet<string>> = {
  accommodation_rates: new Set([
    'pp_double_eur', 'single_supp_eur', 'triple_red_eur',
    'pp_double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur',
    'low_season_from', 'low_season_to',
    'high_pp_double_eur', 'high_single_supp_eur', 'high_triple_red_eur',
    'high_pp_double_non_eur', 'high_single_supp_non_eur', 'high_triple_red_non_eur',
    'high_season_from', 'high_season_to',
    'peak_pp_double_eur', 'peak_single_supp_eur', 'peak_triple_red_eur',
    'peak_pp_double_non_eur', 'peak_single_supp_non_eur', 'peak_triple_red_non_eur',
    'peak_season_from', 'peak_season_to', 'peak_season_2_from', 'peak_season_2_to',
  ]),
  nile_cruises: new Set([
    'low_season_start', 'low_season_end',
    'rate_low_single_eur', 'rate_low_double_eur', 'rate_low_triple_eur',
    'rate_low_single_non_eur', 'rate_low_double_non_eur', 'rate_low_triple_non_eur',
    'high_season_start', 'high_season_end',
    'rate_high_single_eur', 'rate_high_double_eur', 'rate_high_triple_eur',
    'rate_high_single_non_eur', 'rate_high_double_non_eur', 'rate_high_triple_non_eur',
    'peak_season_1_start', 'peak_season_1_end', 'peak_season_2_start', 'peak_season_2_end',
    'rate_peak_single_eur', 'rate_peak_double_eur', 'rate_peak_triple_eur',
    'rate_peak_single_non_eur', 'rate_peak_double_non_eur', 'rate_peak_triple_non_eur',
  ]),
}

const ENTITY: Record<string, RateSeasonEntity> = {
  accommodation_rates: 'accommodation',
  nile_cruises: 'cruise',
}

/** [sheet column, period rate field]. Prices are per person per night. */
const PERIOD_RATE_COLUMNS: Array<[string, string]> = [
  ['period_pp_double_eur', 'ppd_eur'],
  ['period_single_supp_eur', 'single_supplement_eur'],
  ['period_triple_red_eur', 'triple_reduction_eur'],
  ['period_pp_double_non_eur', 'ppd_non_eur'],
  ['period_single_supp_non_eur', 'single_supplement_non_eur'],
  ['period_triple_red_non_eur', 'triple_reduction_non_eur'],
  ['period_guide_rate_eur', 'guide_rate_eur'],
]

export const PERIOD_COLUMNS = [
  'period_name', 'period_season', 'period_from', 'period_to',
  ...PERIOD_RATE_COLUMNS.map(([c]) => c),
]

/** Hotels and cruises use the one sheet; every other rate table keeps its own. */
export function usesOneSheet(table: string): boolean {
  return table in PERIOD_CARRIED
}

/** The property's own columns in the sheet, in config order. */
export function detailColumns(config: RateTableConfig, opts: { template?: boolean } = {}): string[] {
  const carried = PERIOD_CARRIED[config.tableName] ?? new Set<string>()
  return config.columns
    .filter(c => !carried.has(c.name))
    .filter(c => !opts.template || (!c.exportOnly && !c.legacy))
    .map(c => c.name)
}

export function oneSheetHeaders(config: RateTableConfig, opts: { template?: boolean } = {}): string[] {
  return [...detailColumns(config, opts), ...PERIOD_COLUMNS]
}

/** Is this file the one sheet? (Its period columns say so.) */
export function detectOneSheet(headers: string[]): boolean {
  const h = new Set(headers.map(x => x.trim()))
  return h.has('period_from') && h.has('period_to') && h.has('period_pp_double_eur')
}

/**
 * Sheet rows for export: one per stored period, the details repeated.
 * `detailCell` reads a detail column (the export's alias-aware reader);
 * `seasonLabel` turns a stored season key into the agency's word.
 */
export function buildOneSheetRows(
  rows: Array<Record<string, unknown>>,
  config: RateTableConfig,
  detailCell: (row: Record<string, unknown>, column: string) => unknown,
  seasonLabel: (key: string) => string = k => k,
): Array<Record<string, unknown>> {
  const details = detailColumns(config)
  const out: Array<Record<string, unknown>> = []
  for (const row of rows) {
    const base = Object.fromEntries(details.map(c => [c, detailCell(row, c) ?? '']))
    const periods = Array.isArray(row.seasons) ? (row.seasons as RateSeason[]) : []
    if (periods.length === 0) {
      out.push({ ...base, ...Object.fromEntries(PERIOD_COLUMNS.map(c => [c, ''])) })
      continue
    }
    for (const p of periods) {
      const rates = p.rates ?? {}
      out.push({
        ...base,
        period_name: p.name ?? '',
        period_season: p.season ? seasonLabel(p.season) : '',
        period_from: p.from ?? '',
        period_to: p.to ?? '',
        ...Object.fromEntries(PERIOD_RATE_COLUMNS.map(([c, f]) => [c, rates[f] ?? 0])),
      })
    }
  }
  return out
}

/** A two-period example for the Sample CSV (the example key is skipped on import). */
export function oneSheetTemplateRows(config: RateTableConfig, detailExample: Record<string, string>): Array<Record<string, string>> {
  const details = Object.fromEntries(detailColumns(config, { template: true }).map(c => [c, detailExample[c] ?? '']))
  const period = (name: string, season: string, from: string, to: string, ppd: number) => ({
    ...details,
    period_name: name, period_season: season, period_from: from, period_to: to,
    period_pp_double_eur: String(ppd), period_single_supp_eur: String(Math.round(ppd * 0.8)), period_triple_red_eur: '5',
    period_pp_double_non_eur: String(ppd), period_single_supp_non_eur: String(Math.round(ppd * 0.8)), period_triple_red_non_eur: '5',
    period_guide_rate_eur: '40',
  })
  return [
    period('Summer 2026', 'Low Season', '2026-05-01', '2026-09-30', 90),
    period('Winter 2026/27', 'High Season', '2026-10-01', '2027-04-30', 120),
  ]
}

export interface OneSheetGroup {
  /** The file line of the property's first row (for messages). */
  line: number
  /** Detail cells, one set per property. */
  details: Record<string, string>
  /** The periods the file lists for it (season still the file's WORD). */
  periods: RateSeason[]
}

export interface OneSheetParse {
  groups: OneSheetGroup[]
  errors: Array<{ row: number; column: string; message: string }>
}

/**
 * Group the one sheet back into properties: details once (refusing a property
 * whose rows disagree on one), periods as listed. Rows group by the table's
 * key column, or by the property name when the key is blank (a new hotel
 * without a service code yet).
 */
export function parseOneSheet(rows: Array<Record<string, string>>, config: RateTableConfig): OneSheetParse {
  const keyColumn = config.uniqueKey[0]
  const nameColumn = config.tableName === 'nile_cruises' ? 'ship_name' : 'property_name'
  const details = detailColumns(config)
  const exportOnly = new Set(config.columns.filter(c => c.exportOnly).map(c => c.name))
  const errors: OneSheetParse['errors'] = []

  const keyOf = (r: Record<string, string>) => {
    const k = (r[keyColumn] ?? '').trim()
    if (k) return k
    const n = (r[nameColumn] ?? '').trim().toLowerCase()
    return n ? `name:${n}` : ''
  }

  const byKey = new Map<string, { line: number; details: Record<string, string>; conflicted: boolean }>()
  const periodRows: Array<Record<string, string>> = []
  rows.forEach((r, i) => {
    const line = i + 2
    const key = keyOf(r)
    // Every row goes to the periods parser, so its line numbers match the
    // file; a key-less row is reported here, not there.
    periodRows.push({
      'Service Code': key,
      'Period Name': r.period_name ?? '',
      Season: r.period_season ?? '',
      From: r.period_from ?? '',
      To: r.period_to ?? '',
      'PP Double (EU passport)': r.period_pp_double_eur ?? '',
      'Single Supp (EU passport)': r.period_single_supp_eur ?? '',
      'Triple Red (EU passport)': r.period_triple_red_eur ?? '',
      'PP Double (non-EU passport)': r.period_pp_double_non_eur ?? '',
      'Single Supp (non-EU passport)': r.period_single_supp_non_eur ?? '',
      'Triple Red (non-EU passport)': r.period_triple_red_non_eur ?? '',
      'Guide Bed / Night': r.period_guide_rate_eur ?? '',
    })
    if (!key) {
      // A row saying nothing at all (a trailing blank line) is not an error.
      if (Object.values(r).some(v => (v ?? '').trim())) {
        errors.push({ row: line, column: keyColumn, message: `Row names neither a ${keyColumn} nor a ${nameColumn}` })
      }
      return
    }
    const own = Object.fromEntries(details.map(c => [c, (r[c] ?? '').trim()]))
    const seen = byKey.get(key)
    if (!seen) {
      byKey.set(key, { line, details: own, conflicted: false })
      return
    }
    for (const c of details) {
      if (exportOnly.has(c) || seen.conflicted) continue
      const a = seen.details[c], b = own[c]
      if (a && b && a !== b) {
        errors.push({
          row: line, column: c,
          message: `${key.replace(/^name:/, '')}: its rows disagree on ${c} ("${a}" on line ${seen.line}, "${b}" here) — make the property's rows match`,
        })
        seen.conflicted = true
      } else if (!a && b) {
        seen.details[c] = b
      }
    }
  })

  const periods: PeriodsCsvParse = parsePeriodsCsv(periodRows)
  errors.push(...periods.errors.filter(e => !(e.column === 'service_code')))
  const periodsByKey = new Map(periods.groups.map(g => [g.key, g.periods]))

  const conflictedKeys = new Set(
    [...byKey.entries()].filter(([, v]) => v.conflicted).map(([k]) => k)
  )
  const groups: OneSheetGroup[] = [...byKey.entries()]
    .filter(([k]) => !conflictedKeys.has(k))
    .map(([k, v]) => ({ line: v.line, details: v.details, periods: periodsByKey.get(k) ?? [] }))
  return { groups, errors }
}

export function oneSheetEntity(table: string): RateSeasonEntity | null {
  return ENTITY[table] ?? null
}
