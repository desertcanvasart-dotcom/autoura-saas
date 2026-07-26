// ============================================
// FX REPORTING CONTEXT — one currency per report, or an honest gap
// ============================================
// Shared plumbing for every money report (per-trip P&L, analytics, financial
// reports). Two jobs:
//
//   1. loadFxContext — fetch the rate history a report needs, once, plus a
//      live-rate fallback.
//   2. convertMoneyRows — restate a set of DB rows into one reporting
//      currency, converting each row at the rate on its own date.
//
// The reason this is shared rather than inlined per route: three reports that
// each invent their own currency handling will disagree with each other, and
// an operator comparing the P&L total to the financial-report total will not
// know which one to believe. One implementation means one answer.
//
// POLICY (as everywhere else in this codebase): a row that cannot be
// converted is dropped from the totals and recorded as a hole. It is never
// summed at face value, because adding 60,000 EGP to a euro total as "60,000"
// is not a rounding error — it is a wrong number that looks plausible.

import {
  buildFxIndex,
  convertOnDate,
  emptyFxSummary,
  tallyFx,
  type FxBasis,
  type FxIndex,
  type FxHole,
  type FxSnapshotRow,
  type FxSummary,
} from './fx-conversion'

/** Least-to-most severe, so a row is described by its weakest field. */
const BASIS_RANK: Record<FxBasis, number> = {
  'same-currency': 0,
  historical: 1,
  live: 2,
  none: 3,
}
import { fetchExchangeRates, getExchangeRate } from './currency-service'

/**
 * Cap on snapshot rows pulled into memory. Rows come back newest-first, so
 * this bounds a growing history to its most recent observations.
 */
export const MAX_SNAPSHOT_ROWS = 10000

/** Kept in every snapshot query so cross rates (USD->EUR->EGP) can resolve. */
export const PIVOT_CURRENCY = 'EUR'

export interface FxContext {
  fxIndex: FxIndex
  liveRate?: (from: string, to: string) => number | null
  reportingCurrency: string
  /** How many historical rates backed this report. 0 means live-only. */
  snapshotCount: number
  /** True when rate history exists at all. */
  historyAvailable: boolean
}

export function normalizeCurrencyCode(code: unknown): string {
  return String(code || '').trim().toUpperCase()
}

/**
 * Pick the currency a report should be stated in.
 * Defaults to whatever most of the rows are already denominated in, so an
 * Egypt-only operator is not silently restated into euros because that was
 * the hardcoded default. An explicit request always wins.
 */
export function resolveReportingCurrency(
  rows: Array<{ currency?: string | null }>,
  requested?: string | null
): string {
  const explicit = normalizeCurrencyCode(requested)
  if (explicit) return explicit

  const counts = new Map<string, number>()
  for (const row of rows) {
    const currency = normalizeCurrencyCode(row.currency)
    if (currency) counts.set(currency, (counts.get(currency) || 0) + 1)
  }
  if (counts.size === 0) return 'EUR'

  let best = 'EUR'
  let bestCount = -1
  // Sorted keys so ties resolve deterministically, not by insertion order.
  for (const currency of Array.from(counts.keys()).sort()) {
    const count = counts.get(currency)!
    if (count > bestCount) {
      best = currency
      bestCount = count
    }
  }
  return best
}

/** Minimal shape of the Supabase client calls this module makes. */
interface SnapshotQuery {
  select: (columns: string) => SnapshotQuery
  in: (column: string, values: string[]) => SnapshotQuery
  order: (column: string, opts: { ascending: boolean }) => SnapshotQuery
  limit: (n: number) => PromiseLike<{ data: FxSnapshotRow[] | null; error: unknown }>
}
interface SnapshotClient {
  from: (table: string) => SnapshotQuery
}

/**
 * Load the rate history and live-rate fallback a report needs.
 *
 * Never throws: a missing snapshots table, an unreachable rate API or an RLS
 * denial all degrade to "convert what we can, label the rest". A report that
 * refuses to render because FX is unavailable is worse than one that renders
 * and says which figures are approximate.
 */
export async function loadFxContext(
  supabase: unknown,
  options: { currencies: Iterable<string>; reportingCurrency: string }
): Promise<FxContext> {
  const reportingCurrency = normalizeCurrencyCode(options.reportingCurrency) || 'EUR'

  const currencies = new Set<string>([PIVOT_CURRENCY, reportingCurrency])
  for (const currency of options.currencies) {
    const normalized = normalizeCurrencyCode(currency)
    if (normalized) currencies.add(normalized)
  }
  const currencyList = Array.from(currencies)

  // Only one currency anywhere means nothing needs converting — skip both
  // the snapshot query and the outbound rate-API call entirely.
  if (currencyList.length <= 1) {
    return {
      fxIndex: buildFxIndex([]),
      reportingCurrency,
      snapshotCount: 0,
      historyAvailable: false,
    }
  }

  let snapshotRows: FxSnapshotRow[] = []
  try {
    const { data, error } = await (supabase as SnapshotClient)
      .from('exchange_rate_snapshots')
      .select('base_currency, target_currency, rate, captured_at, source')
      .in('base_currency', currencyList)
      .in('target_currency', currencyList)
      .order('captured_at', { ascending: false })
      .limit(MAX_SNAPSHOT_ROWS)

    if (error) {
      console.error('FX: exchange_rate_snapshots unavailable, falling back to live rates:', error)
    } else {
      snapshotRows = data || []
    }
  } catch (error) {
    console.error('FX: exchange_rate_snapshots query threw, falling back to live rates:', error)
  }

  let liveRate: FxContext['liveRate']
  try {
    const rates = await fetchExchangeRates(PIVOT_CURRENCY)
    liveRate = (from: string, to: string) => getExchangeRate(from, to, rates)
  } catch (error) {
    console.error('FX: live exchange rates unavailable:', error)
  }

  return {
    fxIndex: buildFxIndex(snapshotRows),
    liveRate,
    reportingCurrency,
    snapshotCount: snapshotRows.length,
    historyAvailable: snapshotRows.length > 0,
  }
}

// ============================================
// ROW CONVERSION
// ============================================

export interface MoneyField<T> {
  /** Property on the row holding an amount. */
  name: string
  /**
   * Date whose rate applies to THIS field, when it differs from the row's.
   * An invoice's face value belongs to its issue date; the amount collected
   * against it belongs to the day it was paid.
   */
  date?: (row: T) => string | null | undefined
}

export interface ConvertSpec<T> {
  currency: (row: T) => string | null | undefined
  /** Default date for the row's amounts — "when did this money move". */
  date: (row: T) => string | null | undefined
  fields: Array<string | MoneyField<T>>
  kind?: FxHole['kind']
  reference?: (row: T) => string
}

export interface ConvertResult<T> {
  /** Rows restated into the reporting currency. Unconvertible rows removed. */
  rows: T[]
  holes: FxHole[]
  fx: FxSummary
  /** True when nothing was dropped. */
  complete: boolean
}

function fieldName<T>(field: string | MoneyField<T>): string {
  return typeof field === 'string' ? field : field.name
}

function fieldDate<T>(field: string | MoneyField<T>, row: T, fallback: string | null): string | null {
  if (typeof field === 'string' || !field.date) return fallback
  return field.date(row) ?? fallback
}

/**
 * Restate rows into `ctx.reportingCurrency`, converting each money field at
 * the rate on its own date.
 *
 * A row is kept only if EVERY one of its money fields converts. A row with
 * a converted total but an unconverted paid-amount would silently corrupt
 * collection-rate style ratios, so a partial row is treated as a hole.
 *
 * The FX tally counts once per row, not once per field, so "3 amounts used
 * today's rate" means three transactions rather than three columns.
 */
export function convertMoneyRows<T extends object>(
  ctx: FxContext,
  rows: T[],
  spec: ConvertSpec<T>
): ConvertResult<T> {
  const fx = emptyFxSummary()
  const holes: FxHole[] = []
  const out: T[] = []
  const target = ctx.reportingCurrency

  for (const row of rows) {
    const source = normalizeCurrencyCode(spec.currency(row)) || target
    const rowDate = spec.date(row) ?? null

    const converted: Record<string, number> = {}
    let failed: { field: string; amount: number; date: string | null } | null = null
    // One basis per row: the fields share a currency, so their bases only
    // differ if their dates do. The worst (least exact) one represents the row.
    let rowBasisRank = 0
    let rowBasis: FxBasis = 'same-currency'

    for (const field of spec.fields) {
      const name = fieldName(field)
      const raw = Number((row as Record<string, unknown>)[name] ?? 0)
      const amount = Number.isFinite(raw) ? raw : 0
      const date = fieldDate(field, row, rowDate)

      const result = convertOnDate(ctx.fxIndex, amount, source, target, date, ctx.liveRate)

      if (BASIS_RANK[result.basis] > rowBasisRank) {
        rowBasisRank = BASIS_RANK[result.basis]
        rowBasis = result.basis
      }

      if (result.amount === null) {
        failed = { field: name, amount, date }
        break
      }
      converted[name] = result.amount
    }

    tallyFx(fx, rowBasis)

    if (failed) {
      const reference = spec.reference?.(row) ?? 'record'
      holes.push({
        kind: spec.kind || 'expense',
        reference,
        amount: failed.amount,
        fromCurrency: source,
        toCurrency: target,
        date: failed.date,
        message: `${reference} is in ${source} and no ${source}/${target} rate is available for ${failed.date || 'its date'} — excluded from this report.`,
      })
      continue
    }

    out.push({ ...row, ...converted })
  }

  return { rows: out, holes, fx, complete: holes.length === 0 }
}

/** Every distinct currency appearing across several row sets. */
export function collectCurrencies(
  ...rowSets: Array<Array<{ currency?: string | null }> | null | undefined>
): Set<string> {
  const currencies = new Set<string>()
  for (const rows of rowSets) {
    for (const row of rows || []) {
      const currency = normalizeCurrencyCode(row.currency)
      if (currency) currencies.add(currency)
    }
  }
  return currencies
}
