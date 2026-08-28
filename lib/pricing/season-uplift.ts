// ============================================
// The operator's demand premium (C3.1)
// ============================================
// Supplier seasonality already lives on the rate rows: a hotel or a cruise
// ship costs more in its own high season, and the engine picks that up from
// the travel date. This is the other kind — the operator's own judgement that
// a date sells out, so it is worth more.
//
// It therefore sits AFTER margin, on the selling price, and never touches
// supplier cost. Cost is what somebody charged; this is what the operator has
// decided to ask. Applying it to cost as well would charge the customer twice
// for the same season.
//
// Pure. The windows come from pricing_season_dates (migration 304), the
// arithmetic is here, and neither needs a database to be checked.

/** One dated window, joined to the season that owns it. */
export interface SeasonWindow {
  seasonId: string
  name: string
  upliftPercent: number
  /** Inclusive, both ends. YYYY-MM-DD. */
  startDate: string
  endDate: string
}

export interface SeasonMatch {
  seasonId: string
  name: string
  upliftPercent: number
}

const day = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

/**
 * The season a departure falls in, or null for an ordinary date.
 *
 * WHICH DATE: the departure. A trip that runs into a peak without leaving in
 * it is priced as an ordinary departure, because the departure date is what
 * the operator publishes, chooses and sells.
 *
 * OVERLAP: the highest premium wins. Windows will overlap — New Year and a
 * broad "winter peak" can cover the same days — and the alternatives are
 * worse: first-created is invisible to the person reading the calendar, and
 * summing turns two 15% seasons into 32.25%.
 */
export function seasonForDate(
  windows: SeasonWindow[],
  departureDate: string | null | undefined
): SeasonMatch | null {
  const at = day(departureDate)
  if (at == null) return null

  let best: SeasonMatch | null = null
  for (const w of windows) {
    const from = day(w.startDate)
    const to = day(w.endDate)
    if (from == null || to == null) continue
    if (at < from || at > to) continue
    if (!best || w.upliftPercent > best.upliftPercent) {
      best = { seasonId: w.seasonId, name: w.name, upliftPercent: w.upliftPercent }
    }
  }
  return best
}

export interface UpliftBreakdown {
  /** The premium in currency, rounded by the caller's rules. */
  amount: number
  /** What the premium was charged on — the whole selling price. */
  base: number
  percent: number
  seasonName: string | null
}

/**
 * The premium on a selling price.
 *
 * ON THE WHOLE PRICE, nothing carved out. Exempting "pass-throughs" like tips
 * and entrance fees sounds principled, but the engine already applies the
 * operator's MARGIN to those same lines — so the exemption would hold for
 * half the markup and not the other. One rule applied consistently beats a
 * principle that contradicts the code beside it, and a premium on the final
 * total is a number the operator can check on paper: 408.75 × 1.15 = 470.06.
 *
 * AFTER MARGIN, by convention rather than arithmetic: cost × (1+m) × (1+p)
 * and cost × (1+p) × (1+m) are the same money. This order is what keeps
 * `marginAmount` meaning margin and leaves the premium as its own line.
 */
export function computeUplift(input: {
  sellingPrice: number
  season: SeasonMatch | null
}): UpliftBreakdown {
  const percent = input.season?.upliftPercent ?? 0
  const base = Math.max(0, input.sellingPrice)

  return {
    amount: percent > 0 ? (base * percent) / 100 : 0,
    base,
    percent,
    seasonName: input.season?.name ?? null,
  }
}
