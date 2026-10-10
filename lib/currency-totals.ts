// ============================================
import { getCurrencySymbol } from '@/lib/currency'
// PER-CURRENCY TOTALS
// ============================================
// The payments dashboard summed amounts across currencies into one number and
// rendered it with a hardcoded '€'. A $10,000 payment and a £5,000 payment
// showed as "€15,000 Total Received" — a figure that is not true in any
// currency, driving wrong revenue and wrong collection decisions.
//
// Money in different currencies does not add. These helpers keep the sums
// SEPARATE by currency, so the UI can show "€12,400 + $3,000" instead of a
// meaningless merged total. No FX conversion is invented here — this codebase
// deliberately never fabricates a rate.

export type CurrencyTotals = Record<string, number>

export function currencySymbol(code: string): string {
  return getCurrencySymbol(code)
}

/** Normalise to a 3-letter upper code; blank/garbage falls back to EUR. */
function normCurrency(c: unknown): string {
  const s = typeof c === 'string' ? c.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Start an empty accumulator. */
export function emptyTotals(): CurrencyTotals {
  return {}
}

/** Add one amount to its currency bucket, rounding the bucket to cents. */
export function addToTotals(totals: CurrencyTotals, amount: unknown, currency: unknown): void {
  const code = normCurrency(currency)
  const next = (totals[code] ?? 0) + num(amount)
  totals[code] = Math.round(next * 100) / 100
}

/** Sum a list into per-currency totals. */
export function sumByCurrency<T>(
  items: T[] | null | undefined,
  getAmount: (item: T) => unknown,
  getCurrency: (item: T) => unknown
): CurrencyTotals {
  const totals = emptyTotals()
  for (const item of items ?? []) addToTotals(totals, getAmount(item), getCurrency(item))
  return totals
}

export type RateAverage = { amount: number; currency: string | null }

/**
 * Average a rate column in ONE currency, or refuse to average at all.
 *
 * The same rule as sumByCurrency, one level up. Money in different currencies
 * does not add, and it does not average either: the rates pages summed every
 * row's raw amount, divided by the row count and rendered the result with the
 * viewer's symbol, so a list of EGP rows produced a euro figure nobody had
 * entered (operator, 1 Sep).
 *
 * Average the rows in the tenant's own rates currency when there are any;
 * otherwise, if every priced row shares one entry currency (an all-EGP list),
 * average in THAT currency; mixed currencies return null, which the caller
 * renders as a dash. Nothing is converted — this is a stat, not an exchange
 * desk, and this codebase does not invent rates.
 *
 * Unpriced rows are excluded from the sum AND the count: a blank rate is a
 * hole, not a 0, and averaging it in reports a rate nobody charges.
 *
 * Returns null rather than a '—' string so a caller cannot format a dash as a
 * number.
 */
export function averageRateInOneCurrency<T>(
  items: T[] | null | undefined,
  getAmount: (item: T) => unknown,
  getCurrency: (item: T) => unknown
): RateAverage | null {
  const code = (item: T): string | null => {
    const c = getCurrency(item)
    return typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : null
  }
  const priced = (items ?? []).filter(i => num(getAmount(i)) > 0)
  if (priced.length === 0) return null

  const avg = (rows: T[]) => {
    const mean = rows.reduce((sum, r) => sum + num(getAmount(r)), 0) / rows.length
    return Math.round(mean * 100) / 100
  }

  const tenantRows = priced.filter(i => code(i) === null)
  if (tenantRows.length) return { amount: avg(tenantRows), currency: null }

  const currencies = new Set(priced.map(code))
  if (currencies.size === 1) return { amount: avg(priced), currency: code(priced[0]) }
  return null
}

/**
 * Render totals for a single tile: "€1,200.00 + $300.00".
 *
 * Empty → the given zero string in a sensible default currency, so a tile
 * never renders blank. Buckets that summed to exactly 0 are dropped UNLESS
 * that leaves nothing, in which case one zero is shown.
 */
export function formatTotals(totals: CurrencyTotals, opts?: { defaultCurrency?: string }): string {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0)
  if (entries.length === 0) {
    const code = opts?.defaultCurrency ?? 'EUR'
    return formatMoney(0, code)
  }
  // Largest first, so the dominant currency leads. Each as formatMoney writes
  // it, in its own decimals: yen tiles read JPY120,000.00 before.
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return entries.map(([code, v]) => formatMoney(v, code)).join(' + ')
}

// ---------------------------------------------------------------------------
// Rounding to the smallest unit a currency actually has (ported from
// travel-ops-pro). Any money DERIVED by arithmetic — a deposit taken as a
// percentage, a balance taken as a difference — passes through here before it
// is stored or billed: (1854367 * 20) / 100 is 370,873.4 yen, and a yen with a
// decimal place is not a quantity of money that exists.
// ---------------------------------------------------------------------------
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'PYG', 'RWF', 'XAF', 'XOF'])

export function currencyDecimals(code: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(String(code || '').toUpperCase()) ? 0 : 2
}

export function roundToCurrency(amount: unknown, currency: unknown): number {
  const s = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  const code = /^[A-Z]{3}$/.test(s) ? s : 'EUR'
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''))
  const value = Number.isFinite(n) ? n : 0
  const factor = currencyDecimals(code) === 0 ? 1 : 100
  return Math.round(value * factor) / factor
}

/**
 * Money as a client reads it: the currency's symbol, thousands separators and
 * the currency's own decimals — ¥450,000, $1,250.00, MAD 3,400.00. Documents
 * printed `${symbol}${n.toFixed(2)}`: "JPY450000.00", "MAD3400.00".
 */
export function formatMoney(amount: unknown, currency: unknown): string {
  const code = String(currency ?? '').trim().toUpperCase() || 'EUR'
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''))
  const value = Number.isFinite(n) ? n : 0
  const decimals = currencyDecimals(code)
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
  const symbol = getCurrencySymbol(code)
  // A code used as its own symbol ("MAD", "JPY") reads as a word: give it a space.
  return /^[A-Z]{2,4}$/.test(symbol) ? `${symbol} ${number}` : `${symbol}${number}`
}

/**
 * Amounts rounded to the currency so they still add up to their rounded sum
 * (largest remainder). Each line rounded on its own drifts: three yen lines of
 * 333.4 print ¥333 ×3 = ¥999 under a ¥1,000 total.
 */
export function roundLinesToTotal(amounts: number[], currency: unknown): number[] {
  const factor = currencyDecimals(String(currency ?? '').trim().toUpperCase()) === 0 ? 1 : 100
  const units = amounts.map(a => (Number.isFinite(a) ? a : 0) * factor)
  const target = Math.round(units.reduce((s, u) => s + u, 0))
  const floors = units.map(u => Math.floor(u + 1e-9))
  let left = target - floors.reduce((s, f) => s + f, 0)
  const order = units.map((u, i) => ({ i, rem: u - floors[i] })).sort((a, b) => b.rem - a.rem)
  for (const { i } of order) {
    if (left <= 0) break
    floors[i] += 1
    left -= 1
  }
  return floors.map(f => f / factor)
}
