// ============================================
// PER-RATE CURRENCY — the fetch-boundary normalizer (P3)
// ============================================
// A rate row may carry rate_currency (migration 295): the contract currency
// its monetary columns are stored in. The stored row is NEVER rewritten —
// pricing works on a converted COPY made here, at the fetch boundary, so
// every consumer downstream keeps seeing the run currency (EUR) it has
// always assumed.
//
// Rules:
//   - rate_currency NULL/absent, or equal to the run currency → the row
//     passes through BY REFERENCE, byte-identical (deploy-order safety: on a
//     database without migration 295 nothing changes at all).
//   - conversion uses the live exchange_rates table (lib/currency.ts
//     semantics: direct rate, else inverse). NEVER-GUESS: if no usable rate
//     exists, the row's monetary columns are set to NULL — a missing-rate
//     hole the engine already knows how to flag — rather than pricing with a
//     silently wrong number. Each such row is recorded in `misses`.

import { convertCurrency, type ExchangeRate } from '@/lib/currency'

export const RUN_CURRENCY = 'EUR'

// Monetary columns per table — amounts only, never capacities, pax counts,
// durations, percentages, or star ratings. Derived from the live schema
// (types/database.types.ts); a new monetary column on any of these tables
// MUST be added here or it will silently stay unconverted.
export const RATE_MONETARY_COLUMNS: Record<string, string[]> = {
  guides: ['daily_rate', 'half_day_rate', 'hourly_rate'],
  guide_rates: ['half_day_rate', 'full_day_rate', 'base_rate_eur', 'base_rate_non_eur'],
  entrance_fees: ['eur_rate', 'non_eur_rate', 'egyptian_rate'],
  tipping_rates: ['rate_eur'],
  hotel_staff_rates: ['rate_eur'],
  airport_staff_rates: ['rate_eur'],
  meal_rates: ['base_rate_eur', 'base_rate_non_eur'],
  activity_rates: ['base_rate_eur', 'base_rate_non_eur'],
  train_rates: ['rate_eur', 'guide_rate'],
  sleeping_train_rates: ['rate_oneway_eur', 'rate_roundtrip_eur', 'rate_oneway_non_eur', 'rate_roundtrip_non_eur', 'guide_rate'],
  flight_rates: ['base_rate_eur', 'tax_eur', 'base_rate_non_eur', 'tax_non_eur', 'guide_rate'],
  fixed_daily_costs: ['cost_per_person_per_day'],
  b2b_transport_packages: ['sedan_rate', 'minivan_rate', 'van_rate', 'minibus_rate', 'bus_rate'],
  transportation_rates: [
    'base_rate_eur', 'base_rate_non_eur', 'rate_per_day',
    'sedan_rate_eur', 'sedan_rate_non_eur',
    'minivan_rate_eur', 'minivan_rate_non_eur',
    'van_rate_eur', 'van_rate_non_eur',
    'minibus_rate_eur', 'minibus_rate_non_eur',
    'bus_rate_eur', 'bus_rate_non_eur',
  ],
  accommodation_rates: [
    'rate_low_season_sgl', 'rate_high_season_sgl', 'rate_peak_season_sgl',
    'rate_low_season_dbl', 'rate_high_season_dbl', 'rate_peak_season_dbl',
    'ppd_eur', 'ppd_non_eur',
    'single_supplement_eur', 'single_supplement_non_eur',
    'triple_reduction_eur', 'triple_reduction_non_eur',
    'high_season_ppd_eur', 'high_season_ppd_non_eur',
    'high_season_single_supplement_eur', 'high_season_single_supplement_non_eur',
    'high_season_triple_reduction_eur', 'high_season_triple_reduction_non_eur',
    'peak_season_ppd_eur', 'peak_season_ppd_non_eur',
    'peak_season_single_supplement_eur', 'peak_season_single_supplement_non_eur',
    'peak_season_triple_reduction_eur', 'peak_season_triple_reduction_non_eur',
    'single_rate_eur', 'double_rate_eur', 'triple_rate_eur', 'suite_rate_eur',
    'single_rate_non_eur', 'double_rate_non_eur', 'triple_rate_non_eur', 'suite_rate_non_eur',
    'high_season_single_eur', 'high_season_double_eur', 'high_season_triple_eur', 'high_season_suite_eur',
    'high_season_single_non_eur', 'high_season_double_non_eur', 'high_season_triple_non_eur', 'high_season_suite_non_eur',
    'peak_season_single_eur', 'peak_season_double_eur', 'peak_season_triple_eur', 'peak_season_suite_eur',
    'peak_season_single_non_eur', 'peak_season_double_non_eur', 'peak_season_triple_non_eur', 'peak_season_suite_non_eur',
    'base_rate_eur', 'base_rate_non_eur',
    'pp_double_eur', 'single_supp_eur', 'triple_red_eur',
    'pp_double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur',
    'high_pp_double_eur', 'high_single_supp_eur', 'high_triple_red_eur',
    'high_pp_double_non_eur', 'high_single_supp_non_eur', 'high_triple_red_non_eur',
    'peak_pp_double_eur', 'peak_single_supp_eur', 'peak_triple_red_eur',
    'peak_pp_double_non_eur', 'peak_single_supp_non_eur', 'peak_triple_red_non_eur',
    'high_season_rate_eur', 'high_season_rate_non_eur',
    'low_season_rate_eur', 'low_season_rate_non_eur',
  ],
  nile_cruises: [
    'rate_low_season', 'rate_high_season', 'rate_peak_season',
    'ppd_eur', 'ppd_non_eur',
    'single_supplement_eur', 'single_supplement_non_eur',
    'triple_reduction_eur', 'triple_reduction_non_eur',
    'high_season_ppd_eur', 'high_season_ppd_non_eur',
    'high_season_single_supplement_eur', 'high_season_single_supplement_non_eur',
    'high_season_triple_reduction_eur', 'high_season_triple_reduction_non_eur',
    'peak_season_ppd_eur', 'peak_season_ppd_non_eur',
    'peak_season_single_supplement_eur', 'peak_season_single_supplement_non_eur',
    'peak_season_triple_reduction_eur', 'peak_season_triple_reduction_non_eur',
    'rate_single_eur', 'rate_double_eur', 'rate_triple_eur',
    'rate_double_eur_low', 'rate_double_eur_high', 'rate_double_eur_peak',
    'rate_low_single_eur', 'rate_low_double_eur', 'rate_low_triple_eur', 'rate_low_suite_eur',
    'rate_low_single_non_eur', 'rate_low_double_non_eur', 'rate_low_triple_non_eur', 'rate_low_suite_non_eur',
    'rate_high_single_eur', 'rate_high_double_eur', 'rate_high_triple_eur', 'rate_high_suite_eur',
    'rate_high_single_non_eur', 'rate_high_double_non_eur', 'rate_high_triple_non_eur', 'rate_high_suite_non_eur',
    'rate_peak_single_eur', 'rate_peak_double_eur', 'rate_peak_triple_eur', 'rate_peak_suite_eur',
    'rate_peak_single_non_eur', 'rate_peak_double_non_eur', 'rate_peak_triple_non_eur', 'rate_peak_suite_non_eur',
  ],
}

export interface RateCurrencyMiss {
  table: string
  rowId: string | null
  fromCurrency: string
  reason: string
}

export interface RateNormalizer {
  /** Convert rows of `table` into the run currency. Rows already in the run
   *  currency (or with no rate_currency at all) come back BY REFERENCE. */
  normalize<T extends Record<string, unknown>>(table: string, rows: T[]): T[]
  /** Rows whose currency could not be converted — monetary columns nulled. */
  misses: RateCurrencyMiss[]
}

export function createRateNormalizer(
  exchangeRates: ExchangeRate[],
  runCurrency: string = RUN_CURRENCY
): RateNormalizer {
  const misses: RateCurrencyMiss[] = []

  function normalize<T extends Record<string, unknown>>(table: string, rows: T[]): T[] {
    const columns = RATE_MONETARY_COLUMNS[table]
    if (!columns) return rows

    return rows.map(row => {
      const from = row.rate_currency
      if (!from || typeof from !== 'string' || from === runCurrency) return row

      // Probe once per row: is this currency convertible at all?
      const probe = convertCurrency(1, from, runCurrency, exchangeRates)
      const copy: Record<string, unknown> = { ...row }

      if (probe === null) {
        // NEVER-GUESS: no usable exchange rate. Null the money so the row
        // becomes a missing-rate hole instead of a wrong price.
        for (const col of columns) {
          if (col in copy) copy[col] = null
        }
        // Periods too — an unconvertible row must not keep priceable windows.
        if ('seasons' in copy) copy.seasons = null
        misses.push({
          table,
          rowId: typeof row.id === 'string' ? row.id : null,
          fromCurrency: from,
          reason: `no active exchange rate ${from}→${runCurrency}`,
        })
      } else {
        for (const col of columns) {
          const value = copy[col]
          if (typeof value === 'number') {
            copy[col] = convertCurrency(value, from, runCurrency, exchangeRates)
          }
        }
        // Dated rate periods (C3.2) carry their own rate sets inside JSONB —
        // converting only the flat columns would price a foreign-currency
        // hotel's Christmas window at its raw contract number.
        if ('seasons' in copy) {
          copy.seasons = convertSeasons(copy.seasons, from, runCurrency, exchangeRates)
        }
      }
      // The copy is IN the run currency now; make that unambiguous downstream.
      copy.rate_currency = runCurrency
      return copy as T
    })
  }

  return { normalize, misses }
}

// --------------------------------------------
// Live wrapper — exchange rates cached briefly per process
// --------------------------------------------

interface MinimalRatesDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: boolean): PromiseLike<{ data: ExchangeRate[] | null; error: unknown }>
    }
  }
}

let fxCache: { rates: ExchangeRate[]; at: number } | null = null
const FX_CACHE_MS = 60_000

/** Test seam. */
export function clearFxCache() {
  fxCache = null
}

async function loadExchangeRates(db: object): Promise<ExchangeRate[]> {
  const now = Date.now()
  if (fxCache && now - fxCache.at < FX_CACHE_MS) return fxCache.rates
  try {
    const { data, error } = await (db as MinimalRatesDb)
      .from('exchange_rates')
      .select('base_currency, target_currency, rate, is_active')
      .eq('is_active', true)
    if (error || !data) return fxCache?.rates ?? []
    fxCache = { rates: data, at: now }
    return data
  } catch {
    return fxCache?.rates ?? []
  }
}

/**
 * Normalize freshly fetched rate rows into the run currency, loading the
 * exchange-rate table on demand (cached ~60s per process). Never throws;
 * conversion misses are logged and surface as nulled (missing) rates.
 */
export async function normalizeRateRows<T extends Record<string, unknown>>(
  db: object,
  table: string,
  rows: T[] | null | undefined,
  runCurrency: string = RUN_CURRENCY
): Promise<T[]> {
  if (!rows || rows.length === 0) return rows ?? []
  // Fast path: nothing on this page of rows carries a foreign currency.
  if (!rows.some(r => r.rate_currency && r.rate_currency !== runCurrency)) return rows

  const exchangeRates = await loadExchangeRates(db)
  const normalizer = createRateNormalizer(exchangeRates, runCurrency)
  const out = normalizer.normalize(table, rows)
  for (const miss of normalizer.misses) {
    console.error(
      `rate-currency: ${miss.table} row ${miss.rowId ?? '?'} priced in ${miss.fromCurrency} but ${miss.reason} — rate treated as missing`
    )
  }
  return out
}

// --------------------------------------------
// Write-side helper for the rate API routes
// --------------------------------------------

/**
 * Include rate_currency in a write payload ONLY when the client sent the key
 * (deploy-order safety: a form on an unmigrated database never names the
 * column). Empty string means "clear back to the EUR default" → NULL.
 */
export function rateCurrencyWriteField(
  body: Record<string, unknown> | null | undefined
): { rate_currency?: string | null } {
  if (!body || !('rate_currency' in body)) return {}
  const v = body.rate_currency
  return { rate_currency: typeof v === 'string' && v ? v : null }
}

/**
 * Convert the rate sets inside a `seasons` JSONB array (C3.2). Shape-
 * tolerant: anything that is not the expected array of {rates:{...}} objects
 * is returned untouched rather than mangled, and an unconvertible number
 * becomes null — the same never-guess rule the flat columns follow.
 */
function convertSeasons(
  value: unknown,
  from: string,
  runCurrency: string,
  exchangeRates: ExchangeRate[]
): unknown {
  const list = typeof value === 'string' ? safeParse(value) : value
  if (!Array.isArray(list)) return value
  return list.map(entry => {
    if (!entry || typeof entry !== 'object') return entry
    const e = entry as Record<string, unknown>
    if (!e.rates || typeof e.rates !== 'object') return entry
    const rates = e.rates as Record<string, unknown>
    const converted: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rates)) {
      converted[k] = typeof v === 'number' ? convertCurrency(v, from, runCurrency, exchangeRates) : v
    }
    return { ...e, rates: converted }
  })
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value) } catch { return null }
}
