// ============================================
// A hotel or cruise rate for the traveller's passport
// ============================================
// Hotels and Nile cruises are the two catalogs that keep a separate rate for
// non-EU passport holders (#224 kept dual entry there on purpose). The engine
// read only the EU column, whatever the traveller's passport, so every
// non-EU rate an agency entered was ignored — while the pricing grid
// (grid-hotel-rate.ts, cruise-ppd.ts) already honoured it.
//
// The rule, the grid's own: a non-EU traveller pays the non-EU figure when
// one is entered, otherwise the EU figure. "Entered" means a positive
// number — a period stores a blank as 0 (sanitizeSeasons), so 0 is "not
// entered", never a free night. Each figure falls back on its own: a non-EU
// nightly rate with a blank non-EU single supplement takes the EU supplement.
// An EU traveller always pays the EU figure.

/** The figure to price from. Returns `eur` unchanged (null/undefined
 *  included) whenever the non-EU figure does not apply, so a caller's own
 *  `??` fallbacks keep working exactly as they did. */
export function passportRate<T>(eur: T, nonEur: unknown, isEurPassport: boolean): T | number {
  if (isEurPassport) return eur
  const n = typeof nonEur === 'string' && nonEur.trim() !== '' ? Number(nonEur) : nonEur
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : eur
}

/** A resolved period's rates (RATE_FIELDS shape) for the passport: the
 *  nightly rate, single supplement and triple reduction, each by passportRate. */
export function periodRatesForPassport(
  rates: Record<string, number>,
  isEurPassport: boolean
): { ppd: number; singleSupplement: number; tripleReduction: number } {
  return {
    ppd: passportRate(rates.ppd_eur, rates.ppd_non_eur, isEurPassport),
    singleSupplement: passportRate(rates.single_supplement_eur, rates.single_supplement_non_eur, isEurPassport),
    tripleReduction: passportRate(rates.triple_reduction_eur, rates.triple_reduction_non_eur, isEurPassport),
  }
}
