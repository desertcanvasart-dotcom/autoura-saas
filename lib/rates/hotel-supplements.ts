// ============================================
// Room supplements — priced in the Quote Builder
// ============================================
// A hotel rate can list supplements (a Nile view, an upper floor, half board),
// each with a low / high / peak price for EU and non-EU passports. They were
// saved on the rate and read by nothing. The Quote Builder now offers each
// supplement of the hotel picked for a night as a per-person Hotel Services
// line for that night: chosen by the operator, never added on its own.
//
// Which price: the season of the hotel's rate period for the trip date — a
// season word containing "peak" reads the peak price, "high" the high one,
// anything else (or no word) the low one. A supplement with no price for that
// season is not offered. Pure and import-free.

export interface HotelSupplement {
  type: string
  name?: string | null
  low_season?: { eur?: number; non_eur?: number } | null
  high_season?: { eur?: number; non_eur?: number } | null
  peak_season?: { eur?: number; non_eur?: number } | null
}

export type SupplementSeason = 'low_season' | 'high_season' | 'peak_season'

/** Which of a supplement's three prices a rate period's season reads. */
export function supplementSeason(seasonKey: string | null | undefined, periodName?: string | null): SupplementSeason {
  const word = `${seasonKey ?? ''} ${periodName ?? ''}`.toLowerCase()
  if (/peak/.test(word)) return 'peak_season'
  if (/high/.test(word)) return 'high_season'
  return 'low_season'
}

const positive = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface SupplementOption {
  type: string
  label: string
  eur: number
  nonEur: number
  season: SupplementSeason
}

/** A hotel rate's supplements, priced for the season; unpriced ones left out. */
export function priceSupplements(
  supplements: unknown,
  season: SupplementSeason,
  labelFor: (key: string) => string = k => k,
): SupplementOption[] {
  if (!Array.isArray(supplements)) return []
  const out: SupplementOption[] = []
  for (const raw of supplements) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as HotelSupplement
    if (typeof s.type !== 'string' || !s.type) continue
    const price = s[season]
    const eur = positive(price?.eur)
    if (eur <= 0) continue
    const label = labelFor(s.type)
    out.push({
      type: s.type,
      label: label && label !== s.type ? label : (s.name || s.type),
      eur,
      nonEur: positive(price?.non_eur) || eur,
      season,
    })
  }
  return out
}
