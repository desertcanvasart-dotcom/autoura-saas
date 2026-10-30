// ============================================
// What a priced line costs in the SUPPLIER's own currency
// ============================================
// Rate sheets are kept in the supplier's currency (rate_currency: EGP for a
// guide, USD for a Nile cruise) and converted into the agency's run currency
// when the grid loads them (lib/rates/rate-currency). The saved itinerary
// line kept only the converted figure — so the supplier's own amount, and the
// rate it was converted at, were lost: the FX reprice skipped every line
// ("no supplier_cost_original recorded") and a booking's service line could
// never be costed in what the supplier is actually paid
// (lib/supplier-own-currency, PR #753 — dormant: 0 of 174 live lines).
//
// So at save, a line priced from a pinned rate row records:
//   supplier_currency       the rate row's currency
//   exchange_rate_used      trip currency per one unit of it (lib/itinerary-fx:
//                           unit_cost = original × rate)
//   supplier_cost_original  PER UNIT, in the supplier's currency = unit_cost ÷ rate
// Nothing is guessed: no rate row, no currency, or no exchange rate → nothing
// recorded, and the line stays in the trip's currency as before.

import type { SupabaseClient } from '@supabase/supabase-js'
import { RATE_MONETARY_COLUMNS, loadExchangeRates } from '@/lib/rates/rate-currency'
import { convertCurrency } from '@/lib/currency'

export interface SupplierCurrencyFields {
  supplier_currency: string
  supplier_cost_original: number
  exchange_rate_used: number
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** Pure: the three fields for one line, or none. `factor` = trip currency per 1 unit of the rate's currency. */
export function supplierCurrencyFields(
  unitCost: unknown,
  rateCurrency: string | null | undefined,
  tripCurrency: string,
  factor: number | null,
): SupplierCurrencyFields | null {
  const unit = typeof unitCost === 'number' ? unitCost : Number(unitCost)
  const from = String(rateCurrency ?? '').trim().toUpperCase()
  const trip = String(tripCurrency ?? '').trim().toUpperCase()
  if (!from || !trip || !Number.isFinite(unit) || unit <= 0) return null
  if (from === trip) return { supplier_currency: trip, supplier_cost_original: round(unit, 2), exchange_rate_used: 1 }
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return null
  return { supplier_currency: from, supplier_cost_original: round(unit / factor, 2), exchange_rate_used: round(factor, 6) }
}

type Line = Record<string, unknown>

/**
 * Add the supplier-currency fields to every saved line that names its rate
 * row (rate_table + rate_id). Reads each table's rate_currency for those rows
 * (this company only) and the company's exchange rates once. In place.
 */
export async function recordSupplierCurrency(
  db: SupabaseClient,
  tenantId: string,
  tripCurrency: string,
  lines: Line[],
): Promise<void> {
  const byTable = new Map<string, Set<string>>()
  for (const l of lines) {
    const table = typeof l.rate_table === 'string' ? l.rate_table : null
    const id = typeof l.rate_id === 'string' ? l.rate_id : null
    if (!table || !id || !(table in RATE_MONETARY_COLUMNS)) continue
    byTable.set(table, (byTable.get(table) ?? new Set()).add(id))
  }
  if (byTable.size === 0) return

  const currencyOf = new Map<string, string>()
  await Promise.all([...byTable].map(async ([table, ids]) => {
    const { data, error } = await db.from(table).select('id, rate_currency').in('id', [...ids]).eq('tenant_id', tenantId)
    if (error) { console.error('[supplier currency] read', table, error.message); return }
    for (const r of data ?? []) {
      const cur = (r as { rate_currency?: string | null }).rate_currency
      if (cur) currencyOf.set(`${table}:${(r as { id: string }).id}`, cur)
    }
  }))
  if (currencyOf.size === 0) return

  const rates = await loadExchangeRates(db, tenantId)
  const factorOf = new Map<string, number | null>()
  const factor = (cur: string) => {
    if (!factorOf.has(cur)) factorOf.set(cur, convertCurrency(1, cur, tripCurrency, rates))
    return factorOf.get(cur) ?? null
  }
  for (const l of lines) {
    const cur = currencyOf.get(`${l.rate_table}:${l.rate_id}`)
    if (!cur) continue
    const fields = supplierCurrencyFields(l.unit_cost, cur, tripCurrency, factor(cur.trim().toUpperCase()))
    if (fields) Object.assign(l, fields)
  }
}
