// ============================================
// A supplier's lines in the supplier's OWN currency, when that is safe
// ============================================
// itinerary_services.total_cost is in the trip's currency (and moves with an
// FX reprice); supplier_currency / supplier_cost_original / exchange_rate_used
// record what the supplier actually charges. An Egyptian guide contracted at
// EGP 3,000 on a yen trip is owed EGP 3,000, not "¥14,xxx".
//
// Here supplier_cost_original is the PER-UNIT contract amount and
// exchange_rate_used is trip currency per unit of it (lib/itinerary-fx
// computeFxReprice: unit_cost = original × rate, total_cost = unit_cost ×
// quantity) — so the line's own-currency cost is original × quantity.
//
// The original is NOT kept in step by every edit (a line edited by hand
// changes unit_cost / total_cost only). A stale original is never stated:
// while original × rate × quantity still agrees with total_cost it is the
// cost; once an edit has moved total_cost, the cost is total_cost ÷ that same
// rate — the conversion run backwards, so an edited EGP line stays an EGP
// line. When every line is in one foreign currency and has a known rate, the
// money is in that currency; otherwise it stays in the trip's, at total_cost.
//
// Used by a booking's supplier rows (lib/bookings/booking-suppliers). The SQL
// backfill in supabase/migrations/454_service_line_own_currency.sql
// applies the same rule. (Ported from travel-ops-pro, where the original is
// the line total.)

export interface OwnCurrencyLine {
  quantity?: number | string | null
  total_cost?: number | string | null
  supplier_currency?: string | null
  supplier_cost_original?: number | string | null
  exchange_rate_used?: number | string | null
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/** Units on the line; a missing or non-positive quantity counts as one (computeFxReprice). */
const units = (s: OwnCurrencyLine) => {
  const q = num(s.quantity)
  return q !== null && q > 0 ? q : 1
}

/** The line's own-currency cost still agrees with its trip-currency total. */
export function ownCostIsCurrent(s: OwnCurrencyLine): boolean {
  const original = num(s.supplier_cost_original)
  const rate = num(s.exchange_rate_used)
  const total = num(s.total_cost)
  if (original === null || rate === null || rate <= 0 || total === null) return false
  // Within a cent per unit of trip currency, or 0.5% — rounding, not an edit.
  return Math.abs(original * rate * units(s) - total) <= Math.max(0.01, Math.abs(total) * 0.005)
}

/** The line's cost in its supplier currency: the stored original × quantity
 *  while it is current, else total_cost at the line's own rate; null with no rate. */
export function ownCost(s: OwnCurrencyLine): number | null {
  if (ownCostIsCurrent(s)) return Math.round(num(s.supplier_cost_original)! * units(s) * 100) / 100
  const rate = num(s.exchange_rate_used)
  const total = num(s.total_cost)
  if (rate === null || rate <= 0 || total === null) return null
  return Math.round((total / rate) * 100) / 100
}

/**
 * The money for a group of one supplier's lines: `own` is true when it is in
 * the supplier's own currency (one foreign currency, every line's rate known).
 */
export function supplierOwnMoney(
  services: OwnCurrencyLine[],
  tripCurrency: string,
): { currency: string; total: number; lineAmounts: number[]; own: boolean } {
  const trip = String(tripCurrency || '').trim().toUpperCase()
  const currencies = new Set(services.map(s => String(s.supplier_currency ?? '').trim().toUpperCase()))
  const [only] = [...currencies]
  const own = services.length > 0
    && currencies.size === 1
    && !!only
    && only !== trip
    && services.every(s => ownCost(s) !== null)
  const lineAmounts = services.map(s => (own ? ownCost(s) : num(s.total_cost)) ?? 0)
  const total = Math.round(lineAmounts.reduce((a, b) => a + b, 0) * 100) / 100
  return { currency: own ? only : tripCurrency, total, lineAmounts, own }
}
