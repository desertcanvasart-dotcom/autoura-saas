// ============================================
// FX CONVERSION — "the rate on the day the money moved"
// ============================================
// Converts a foreign-currency cost into a reporting currency using the
// exchange rate that was true on the transaction's own date, not today's.
//
// Why this exists: a trip quoted in EUR whose hotels were paid in EGP three
// months later has an FX result baked into its margin. Summing the raw
// numbers (what the P&L did before) treats 1000 EGP as 1000 EUR — a ~56x
// error. Converting at today's rate is closer, but still reports a margin
// the operator never actually earned.
//
// POLICY (mirrors the pricing harness, lib/pricing-types.ts): a conversion
// that cannot be backed by a real rate is NEVER guessed. It returns basis
// 'none' with a null amount, and the caller records an FxHole and marks the
// result incomplete. Rate sources are always labelled so the operator can
// see which numbers are historical and which fell back to live.
//
// Rate history lives in `exchange_rate_snapshots` (migration 234), which is
// append-only. `exchange_rates` (migration 122) is upserted and only ever
// holds today's rate — it cannot answer a question about March.

/** Where the rate behind a conversion came from. */
export type FxBasis =
  /** No conversion needed — amount was already in the target currency. */
  | 'same-currency'
  /** A snapshot captured on or before the transaction date. The good case. */
  | 'historical'
  /** No snapshot that old; converted with the current live rate instead. */
  | 'live'
  /** No usable rate at all. Amount is NOT converted and NOT summed. */
  | 'none'

/** A row out of exchange_rate_snapshots. 1 base = <rate> target. */
export interface FxSnapshotRow {
  base_currency: string
  target_currency: string
  rate: number | string
  captured_at: string
  source?: string | null
}

interface IndexedRate {
  rate: number
  capturedAtMs: number
  capturedAt: string
  source: string
}

/** Pair key -> snapshots for that pair, newest first. */
export type FxIndex = Map<string, IndexedRate[]>

export interface FxRateResolution {
  rate: number
  /** Timestamp of the rate used. For a cross rate, the older of the two legs. */
  asOf: string
  source: string
  /** Currency hopped through when no direct pair existed (e.g. 'EUR'). */
  via?: string
}

export interface FxConversion {
  /** Converted amount, or null when basis is 'none'. */
  amount: number | null
  /** Rate applied (1 from = <rate> to), or null. */
  rate: number | null
  basis: FxBasis
  /** Timestamp of the rate used, when one was found. */
  asOf: string | null
  source: string | null
  via?: string
}

/**
 * A cost that could not be converted, so it is absent from the totals.
 * Reports surface these and mark themselves incomplete rather than silently
 * under-counting costs (which would overstate margin — the exact failure
 * this whole module exists to prevent).
 */
export interface FxHole {
  kind: 'expense' | 'commission' | 'trip' | 'invoice' | 'revenue' | 'extra'
  /** Human reference for the row: expense number, commission description. */
  reference: string
  amount: number
  fromCurrency: string
  toCurrency: string
  /** The date whose rate we needed. */
  date: string | null
  message: string
}

/**
 * How much of a report's arithmetic rests on exact rates.
 * Shared by every money report so they all describe their own accuracy the
 * same way.
 */
export interface FxSummary {
  /** Lines already in the reporting currency. */
  same_currency: number
  /** Lines converted at the rate on their own transaction date. */
  historical: number
  /** Lines converted at today's rate — no old enough snapshot existed. */
  live: number
  /** Lines that could not be converted and are excluded from totals. */
  unconverted: number
  /**
   * True when every foreign-currency line was converted at a rate from its
   * own date. False means at least one number is an approximation.
   */
  all_historical: boolean
}

export function emptyFxSummary(): FxSummary {
  return { same_currency: 0, historical: 0, live: 0, unconverted: 0, all_historical: true }
}

export function tallyFx(fx: FxSummary, basis: FxBasis): void {
  switch (basis) {
    case 'same-currency': fx.same_currency++; break
    case 'historical': fx.historical++; break
    case 'live': fx.live++; fx.all_historical = false; break
    case 'none': fx.unconverted++; fx.all_historical = false; break
  }
}

export function mergeFxSummary(into: FxSummary, from: FxSummary): void {
  into.same_currency += from.same_currency
  into.historical += from.historical
  into.live += from.live
  into.unconverted += from.unconverted
  if (!from.all_historical) into.all_historical = false
}

const PAIR_SEPARATOR = '>'

function pairKey(from: string, to: string): string {
  return `${from}${PAIR_SEPARATOR}${to}`
}

function normalizeCurrency(code: string | null | undefined): string {
  return (code || '').trim().toUpperCase()
}

/** Money rounding: 2dp, half away from zero, no negative-zero. */
export function roundMoney(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Build a lookup index from raw snapshot rows.
 * Pure — no DB access, so the resolution logic is fully testable.
 * Invalid rows (non-positive/non-finite rate, unparseable date, missing
 * currency) are dropped rather than trusted.
 */
export function buildFxIndex(rows: FxSnapshotRow[] | null | undefined): FxIndex {
  const index: FxIndex = new Map()

  for (const row of rows || []) {
    const base = normalizeCurrency(row.base_currency)
    const target = normalizeCurrency(row.target_currency)
    const rate = Number(row.rate)
    const capturedAtMs = new Date(row.captured_at).getTime()

    if (!base || !target || base === target) continue
    if (!Number.isFinite(rate) || rate <= 0) continue
    if (!Number.isFinite(capturedAtMs)) continue

    const key = pairKey(base, target)
    const bucket = index.get(key)
    const entry: IndexedRate = {
      rate,
      capturedAtMs,
      capturedAt: row.captured_at,
      source: row.source || 'unknown',
    }
    if (bucket) bucket.push(entry)
    else index.set(key, [entry])
  }

  // Newest first, so a lookup is a scan to the first entry <= the cutoff.
  for (const bucket of index.values()) {
    bucket.sort((a, b) => b.capturedAtMs - a.capturedAtMs)
  }

  return index
}

/** Newest snapshot for an exact pair at or before `atMs`. */
function directRate(index: FxIndex, from: string, to: string, atMs: number): IndexedRate | null {
  const bucket = index.get(pairKey(from, to))
  if (!bucket) return null
  for (const entry of bucket) {
    if (entry.capturedAtMs <= atMs) return entry
  }
  return null
}

/**
 * Every currency reachable from `from` in one hop at `atMs`, with the rate.
 * A stored pair X>Y is usable in both directions: Y>X is 1/rate. The inverse
 * is exact, so this adds reach without adding estimation.
 */
function oneHopEdges(
  index: FxIndex,
  from: string,
  atMs: number
): Map<string, { rate: number; entry: IndexedRate }> {
  const edges = new Map<string, { rate: number; entry: IndexedRate }>()

  for (const [key, bucket] of index) {
    const [base, target] = key.split(PAIR_SEPARATOR)

    let other: string | null = null
    let invert = false
    if (base === from) {
      other = target
    } else if (target === from) {
      other = base
      invert = true
    }
    if (!other) continue

    for (const entry of bucket) {
      if (entry.capturedAtMs > atMs) continue
      const rate = invert ? 1 / entry.rate : entry.rate
      const existing = edges.get(other)
      // Bucket is newest-first, so the first hit is the freshest usable rate.
      if (!existing || entry.capturedAtMs > existing.entry.capturedAtMs) {
        edges.set(other, { rate, entry })
      }
      break
    }
  }

  return edges
}

/**
 * Resolve 1 `from` = ? `to` using rates known on or before `date`.
 *
 * Resolution order, best first:
 *   1. direct pair          (from>to)
 *   2. inverse pair         (to>from, applied as 1/rate — exact)
 *   3. one pivot hop        (from>P and P>to — e.g. USD->EUR->EGP)
 *
 * Stops at one pivot on purpose: each extra hop compounds the staleness of
 * two independent observations, and a 4-currency book never needs more.
 * Returns null when nothing resolves — callers must treat that as a hole.
 */
export function resolveRateOnDate(
  index: FxIndex,
  fromCurrency: string,
  toCurrency: string,
  date: Date | string | null | undefined
): FxRateResolution | null {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)
  if (!from || !to) return null
  if (from === to) return { rate: 1, asOf: new Date(0).toISOString(), source: 'identity' }

  const atMs = date ? new Date(date).getTime() : NaN
  // No date means "as of now" — use the newest snapshot available.
  const cutoff = Number.isFinite(atMs) ? atMs : Date.now()

  const direct = directRate(index, from, to, cutoff)
  if (direct) {
    return { rate: direct.rate, asOf: direct.capturedAt, source: direct.source }
  }

  const inverse = directRate(index, to, from, cutoff)
  if (inverse) {
    return { rate: 1 / inverse.rate, asOf: inverse.capturedAt, source: inverse.source }
  }

  // Pivot: from -> P -> to
  const fromEdges = oneHopEdges(index, from, cutoff)
  const toEdges = oneHopEdges(index, to, cutoff)

  let best: FxRateResolution | null = null
  let bestFreshness = -Infinity

  for (const [pivot, leg1] of fromEdges) {
    const leg2 = toEdges.get(pivot)
    if (!leg2) continue

    // leg1: 1 from = leg1.rate pivot. leg2: 1 to = leg2.rate pivot.
    // => 1 from = leg1.rate / leg2.rate  to
    const rate = leg1.rate / leg2.rate
    if (!Number.isFinite(rate) || rate <= 0) continue

    // A cross rate is only as current as its staler leg.
    const olderMs = Math.min(leg1.entry.capturedAtMs, leg2.entry.capturedAtMs)
    if (olderMs > bestFreshness) {
      bestFreshness = olderMs
      best = {
        rate,
        asOf: leg1.entry.capturedAtMs <= leg2.entry.capturedAtMs
          ? leg1.entry.capturedAt
          : leg2.entry.capturedAt,
        source: `cross:${leg1.entry.source}/${leg2.entry.source}`,
        via: pivot,
      }
    }
  }

  return best
}

/**
 * Convert an amount using the rate on its own date, falling back to a live
 * rate table only when no snapshot is old enough.
 *
 * `liveRate` is a plain resolver (amount-independent) so this stays pure:
 * pass `(from, to) => number | null`.
 */
export function convertOnDate(
  index: FxIndex,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: Date | string | null | undefined,
  liveRate?: (from: string, to: string) => number | null
): FxConversion {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)

  if (!Number.isFinite(amount)) {
    return { amount: null, rate: null, basis: 'none', asOf: null, source: null }
  }

  if (from && to && from === to) {
    return {
      amount: roundMoney(amount),
      rate: 1,
      basis: 'same-currency',
      asOf: null,
      source: null,
    }
  }

  const historical = resolveRateOnDate(index, from, to, date)
  if (historical) {
    return {
      amount: roundMoney(amount * historical.rate),
      rate: historical.rate,
      basis: 'historical',
      asOf: historical.asOf,
      source: historical.source,
      via: historical.via,
    }
  }

  if (liveRate) {
    const rate = liveRate(from, to)
    if (rate !== null && rate !== undefined && Number.isFinite(rate) && rate > 0) {
      return {
        amount: roundMoney(amount * rate),
        rate,
        basis: 'live',
        asOf: null,
        source: 'live',
      }
    }
  }

  // No rate anywhere. Do not guess, do not pass the raw amount through.
  return { amount: null, rate: null, basis: 'none', asOf: null, source: null }
}

/**
 * Every currency pair a set of rows needs, so the caller can fetch exactly
 * the snapshots required in one query instead of loading the whole table.
 * Includes the inverse of each pair (usable via 1/rate) and, when a pivot
 * currency is supplied, the legs needed for a cross rate.
 */
export function collectRequiredPairs(
  items: Array<{ currency?: string | null }>,
  targetCurrency: string,
  pivotCurrency?: string
): string[] {
  const target = normalizeCurrency(targetCurrency)
  const pivot = normalizeCurrency(pivotCurrency || '')
  const currencies = new Set<string>()

  for (const item of items) {
    const currency = normalizeCurrency(item.currency)
    if (currency && currency !== target) currencies.add(currency)
  }

  const pairs = new Set<string>()
  for (const currency of currencies) {
    pairs.add(currency)
    pairs.add(target)
    if (pivot) pairs.add(pivot)
  }

  return Array.from(pairs).sort()
}

/** Human-readable note for a conversion, for tooltips and audit trails. */
export function describeConversion(
  conversion: FxConversion,
  fromCurrency: string,
  toCurrency: string
): string {
  switch (conversion.basis) {
    case 'same-currency':
      return `No conversion — already in ${normalizeCurrency(toCurrency)}.`
    case 'historical': {
      const on = conversion.asOf ? new Date(conversion.asOf).toISOString().split('T')[0] : 'unknown date'
      const via = conversion.via ? ` via ${conversion.via}` : ''
      return `1 ${normalizeCurrency(fromCurrency)} = ${conversion.rate?.toFixed(6)} ${normalizeCurrency(toCurrency)} (rate of ${on}${via}).`
    }
    case 'live':
      return `Converted at today's rate — no ${normalizeCurrency(fromCurrency)}/${normalizeCurrency(toCurrency)} rate on file for the transaction date.`
    case 'none':
      return `No ${normalizeCurrency(fromCurrency)}/${normalizeCurrency(toCurrency)} rate available — amount excluded from totals.`
  }
}
