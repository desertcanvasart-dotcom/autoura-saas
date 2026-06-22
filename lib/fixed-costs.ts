import { createClient } from '@supabase/supabase-js'

// Lazy-initialized service-role client — the pricing engine reads fixed costs
// server-side. Lazy init mirrors auto-pricing-service's getSupabaseAdmin()
// pattern and avoids build-time/import errors when env vars are absent.
// (reads is_active rows, not tenant-scoped here — same as getTippingRate.)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Default fallback values (used when DB has no data / is unavailable).
// 'Water Bottle' = 2 preserves the engine's previous hardcoded water cost.
const DEFAULTS = {
  'Water Bottle': 2,
}

export interface FixedDailyCosts {
  waterPerPersonPerDay: number
}

let cachedCosts: { data: FixedDailyCosts; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch fixed daily costs (water bottles) from the database.
 * Uses a 5-minute in-memory cache to avoid repeated DB queries.
 * Falls back to hardcoded defaults if the table is empty or DB is unavailable.
 *
 * NOTE: Tipping is handled separately via the tipping_rates table —
 * use getTippingRate() from lib/auto-pricing-service.ts for tips.
 */
export async function getFixedDailyCosts(): Promise<FixedDailyCosts> {
  // Return cached if still fresh
  if (cachedCosts && Date.now() - cachedCosts.fetchedAt < CACHE_TTL) {
    return cachedCosts.data
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('fixed_daily_costs')
      .select('cost_type, cost_per_person_per_day')
      .eq('is_active', true)

    if (error) {
      console.warn('[FixedCosts] DB query failed, using defaults:', error.message)
      return {
        waterPerPersonPerDay: DEFAULTS['Water Bottle'],
      }
    }

    const findRate = (type: string) => {
      const record = ((data as any[]) || []).find((r: any) => r.cost_type === type)
      return record?.cost_per_person_per_day ?? DEFAULTS[type as keyof typeof DEFAULTS] ?? 0
    }

    const costs: FixedDailyCosts = {
      waterPerPersonPerDay: findRate('Water Bottle'),
    }

    cachedCosts = { data: costs, fetchedAt: Date.now() }
    return costs
  } catch (err: any) {
    console.warn('[FixedCosts] Exception fetching costs, using defaults:', err.message)
    return {
      waterPerPersonPerDay: DEFAULTS['Water Bottle'],
    }
  }
}

/** Clear the cache (e.g. after updating rates via the admin API) */
export function clearFixedCostsCache() {
  cachedCosts = null
}
