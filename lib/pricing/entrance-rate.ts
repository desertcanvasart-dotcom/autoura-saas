// ============================================================================
// The one place that decides whether an entrance fee has a usable price.
// ============================================================================
// Check 8 of the silent-failure audit: "an empty rate means 'not set yet', not
// 'free'". Until migration 278 the schema could not tell those apart —
// entrance_fees.eur_rate was NOT NULL DEFAULT 0, so an attraction saved
// without a price was stored as 0 and read by every consumer as free.
//
// Now:
//   null  = not priced yet -> the caller must NOT price this line
//   0     = genuinely free -> a real price (Khan el-Khalili has no ticket)
//   n     = the price
//
// Five call sites used to make this decision independently, each with a
// slightly different `|| 0`, and they disagreed: the engine's caller demanded
// `rate > 0` (so it reported free attractions as missing rates), while the two
// B2B routes had no guard at all (so they emitted real EUR 0 lines). Both
// directions were wrong and neither raised anything.
// ============================================================================

export interface EntranceFeeRates {
  eur_rate?: number | string | null
  non_eur_rate?: number | string | null
}

/**
 * The rate that applies to this traveller, or `null` when the attraction has
 * no price recorded.
 *
 * A non-EUR traveller falls back to the EUR rate when no separate non-EUR rate
 * exists — but only when it is absent, never when it is a deliberate 0.
 */
export function resolveEntranceRate(
  fee: EntranceFeeRates | null | undefined,
  isEurPassport: boolean
): number | null {
  if (!fee) return null

  const pick = isEurPassport
    ? fee.eur_rate
    : (fee.non_eur_rate ?? fee.eur_rate)

  if (pick === null || pick === undefined || pick === '') return null

  const n = Number(pick)
  // NaN is a broken value, not a free one.
  return Number.isFinite(n) ? n : null
}
