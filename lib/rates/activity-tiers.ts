// ============================================
// Tiered (group-size) activity pricing (C3.3)
// ============================================
// A felucca, a camel ride, a private boat: the per-person price falls as the
// group grows. Those bands used to be reachable only through
// b2b_pricing_rules — a separate table with FIXED tier1/tier2 columns, wired
// into the two B2B engines by copy-pasted lookups, and disconnected from the
// activity catalog everything else prices from.
//
// Tiers now live on the activity itself (migration 306) as an ordered list,
// so one activity carries as many bands as its contract does:
//
//   { min_pax, max_pax, rate_eur, rate_non_eur?, label? }
//
// Bands are matched on max_pax ascending; a group larger than every band
// takes the last band's rate. rate_non_eur falls back to rate_eur.

export interface ActivityTier {
  min_pax: number
  max_pax: number
  rate_eur: number
  rate_non_eur?: number | null
  label?: string | null
}

/** Parse/validate a tiers payload from a form or API body. Returns null when
 *  the input is absent or unusable — never throws, because a bad payload
 *  should read as "no tiers" (fall back to the flat rate), not a 500. */
export function sanitizeTiers(input: unknown): ActivityTier[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const tiers: ActivityTier[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const t = raw as Record<string, unknown>
    const min_pax = Number(t.min_pax)
    const max_pax = Number(t.max_pax)
    const rate_eur = Number(t.rate_eur)
    // A band without a positive rate is a data-entry hole, not a free
    // activity — refuse the whole set rather than silently pricing at zero.
    if (!Number.isFinite(min_pax) || !Number.isFinite(max_pax) || !Number.isFinite(rate_eur)) return null
    if (min_pax < 1 || max_pax < min_pax || rate_eur <= 0) return null
    const rate_non_eur =
      t.rate_non_eur === null || t.rate_non_eur === undefined || t.rate_non_eur === ''
        ? null
        : Number(t.rate_non_eur)
    if (rate_non_eur !== null && (!Number.isFinite(rate_non_eur) || rate_non_eur <= 0)) return null
    tiers.push({
      min_pax,
      max_pax,
      rate_eur,
      rate_non_eur,
      label: typeof t.label === 'string' && t.label.trim() ? t.label.trim() : null,
    })
  }
  tiers.sort((a, b) => a.max_pax - b.max_pax)
  // Bands must not overlap — each starts after the previous one ends.
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].min_pax <= tiers[i - 1].max_pax) return null
  }
  return tiers
}

/** Tolerates JSONB arriving as a string, which some client paths do. */
export function parseTiers(value: unknown): ActivityTier[] | null {
  if (typeof value === 'string') {
    try { return sanitizeTiers(JSON.parse(value)) } catch { return null }
  }
  return sanitizeTiers(value)
}

/** The band for a group size. Groups beyond every band use the last one. */
export function pickTier(tiers: ActivityTier[], numPax: number): ActivityTier {
  for (const tier of tiers) {
    if (numPax <= tier.max_pax) return tier
  }
  return tiers[tiers.length - 1]
}

export interface TieredPriceResult {
  unitCost: number
  lineTotal: number
  pricingNote: string
  quantityMode: 'per_pax'
}

/** Price a tiered activity: the matched band's per-person rate × pax. */
export function applyActivityTiers(
  tiers: ActivityTier[],
  numPax: number,
  isEurPassport: boolean,
  rateSym: string
): TieredPriceResult {
  const tier = pickTier(tiers, numPax)
  const rate = isEurPassport ? tier.rate_eur : (tier.rate_non_eur ?? tier.rate_eur)
  const label = tier.label || `${tier.min_pax}-${tier.max_pax} pax`
  const total = Math.round(rate * numPax * 100) / 100
  return {
    unitCost: rate,
    lineTotal: total,
    pricingNote: `${label}: ${rateSym}${rate}/pax × ${numPax} = ${rateSym}${total}`,
    quantityMode: 'per_pax',
  }
}

/** Find an active TIERED catalog entry for a service line.
 *
 *  Match order: exact service_code, exact name, then contains-full-name. The
 *  b2b_pricing_rules lookup this supersedes matched on the FIRST WORD only
 *  ("Felucca Ride" → '%Felucca%'), which can hit an unrelated service that
 *  happens to share a first word; contains-full-name is the safer fallback. */
export async function getTieredActivityRate(
  supabase: { from: (table: string) => never },
  serviceName: string,
  tenantId?: string
): Promise<{ tiers: ActivityTier[]; activity_name: string } | null> {
  type Q = {
    select(cols: string): Q
    eq(col: string, val: unknown): Q
    or(expr: string): Q
    not(col: string, op: string, val: unknown): Q
    ilike(col: string, val: string): Q
    limit(n: number): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>
  }
  const base = (): Q => {
    let q = (supabase.from('activity_rates') as unknown as Q)
      .select('activity_name, service_code, tiers')
      .eq('is_active', true)
      .eq('pricing_type', 'tiered')
      .not('tiers', 'is', null)
    if (tenantId) q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    return q
  }

  const attempts: Array<(q: Q) => Q> = [
    q => q.eq('service_code', serviceName),
    q => q.ilike('activity_name', serviceName),
    q => q.ilike('activity_name', `%${serviceName}%`),
  ]
  for (const refine of attempts) {
    const { data, error } = await refine(base()).limit(1)
    if (error) return null
    if (data?.length) {
      const tiers = parseTiers(data[0].tiers)
      if (tiers) return { tiers, activity_name: String(data[0].activity_name ?? serviceName) }
    }
  }
  return null
}
