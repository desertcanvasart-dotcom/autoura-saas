// ============================================
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

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code
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
    return `${currencySymbol(code)}0.00`
  }
  // Largest first, so the dominant currency leads.
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return entries
    .map(([code, v]) => `${currencySymbol(code)}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' + ')
}
