// ============================================
// A rate you can actually charge
// ============================================
// Ported verbatim from travel-ops-pro (lib/pricing/usable-rate.ts) so the two
// apps price optional services with one implementation.
//
// Rate tables are half-filled in practice: a supplier is on file long before
// somebody types what they cost. `daily_rate || 0` turns that gap into a price
// of ZERO, and a re-pricing path that overwrites a real cost with a zero rate
// quietly gives the trip away — the line still prints, it just costs nothing.
//
// So a rate is either usable or absent. Nothing in between, and never zero:
// no guide works for free, no hotel room is complimentary, and a genuinely free
// service is one nobody needs a rate row for.

/** The number if it can be charged, or null if the table has no answer. */
export function usableRate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
