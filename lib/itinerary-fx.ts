// ============================================
// FX FREEZE (P4) — confirmed itineraries do not drift with the market
// ============================================
// exchange_rates refreshes daily. The moment an itinerary is first CONFIRMED,
// the active snapshot is stamped onto itineraries.fx_frozen; from then on a
// rate refresh changes nothing about that trip. Supplier-side costs move only
// through the explicit reprice endpoint, which uses computeFxReprice below —
// pure, tested, and NEVER-GUESS: a line whose contract currency has no usable
// rate is skipped and reported, not restated with a wrong number.
//
// The client price (itineraries.total_cost / selling_price) NEVER moves here.
// Reprice restates what the trip COSTS, not what the client was quoted.

import { convertCurrency, type ExchangeRate } from '@/lib/currency'

// Historical default; the tenant's run currency (C3.4) is passed in where known.
export const FX_BASE = 'EUR'

export interface FrozenRate {
  base_currency: string
  target_currency: string
  rate: number
  is_active: boolean
}

export interface FrozenFx {
  base: string
  rates: FrozenRate[]
  frozen_at: string
  frozen_by: string | null
  source: 'confirm' | 'reprice'
}

export interface RateInput {
  base_currency: string
  target_currency: string
  rate: number
  is_active: boolean | null
}

export function buildFrozenFx(
  exchangeRates: RateInput[],
  frozenBy: string | null,
  source: FrozenFx['source'],
  at: string = new Date().toISOString(),
  base: string = FX_BASE
): FrozenFx {
  return {
    base,
    rates: exchangeRates
      .filter(r => r.is_active)
      .map(r => ({
        base_currency: r.base_currency,
        target_currency: r.target_currency,
        rate: r.rate,
        is_active: true,
      })),
    frozen_at: at,
    frozen_by: frozenBy,
    source,
  }
}

/** Parse a stored fx_frozen value; null for anything malformed. */
export function parseFrozenFx(value: unknown): FrozenFx | null {
  if (!value || typeof value !== 'object') return null
  const fx = value as FrozenFx
  if (!Array.isArray(fx.rates) || !fx.frozen_at) return null
  return fx
}

export interface ServiceLineForFx {
  id: string
  supplier_currency?: string | null
  supplier_cost_original?: number | null
  quantity?: number | null
  unit_cost?: number | null
  total_cost?: number | null
}

export interface FxRepricePatch {
  id: string
  unit_cost: number
  total_cost: number
  exchange_rate_used: number
}

export interface FxRepriceResult {
  patches: FxRepricePatch[]
  /** Lines that could not be restated, with the reason — surfaced, not guessed. */
  skipped: Array<{ id: string; reason: string }>
  /** Lines with no foreign contract currency — untouched by design. */
  untouched: number
}

/**
 * Restate supplier-side line costs from each line's ORIGINAL contract amount
 * (supplier_cost_original in supplier_currency) at the given rates.
 * supplier_cost_original is treated as the PER-UNIT contract amount, matching
 * how unit_cost/total_cost relate (total = unit × quantity).
 */
export function computeFxReprice(
  lines: ServiceLineForFx[],
  rates: FrozenRate[],
  base: string = FX_BASE
): FxRepriceResult {
  const patches: FxRepricePatch[] = []
  const skipped: FxRepriceResult['skipped'] = []
  let untouched = 0

  for (const line of lines) {
    const currency = line.supplier_currency
    if (!currency || currency === base) {
      untouched++
      continue
    }
    const original = line.supplier_cost_original
    if (typeof original !== 'number') {
      skipped.push({ id: line.id, reason: `priced in ${currency} but no supplier_cost_original recorded` })
      continue
    }
    const unitCost = convertCurrency(original, currency, base, rates as ExchangeRate[])
    if (unitCost === null) {
      skipped.push({ id: line.id, reason: `no usable exchange rate ${currency}→${base}` })
      continue
    }
    const quantity = line.quantity ?? 1
    patches.push({
      id: line.id,
      unit_cost: round2(unitCost),
      total_cost: round2(unitCost * quantity),
      exchange_rate_used: round6(unitCost / original),
    })
  }

  return { patches, skipped, untouched }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
