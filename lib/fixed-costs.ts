import { createClient } from '@supabase/supabase-js'
import { normalizeRateRows } from '@/lib/rates/rate-currency'
import { ttlMemo } from '@/lib/ttl-memo'

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

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
// Holds the in-flight read, not only the answer: the pricing engine prices its
// tiers concurrently, and four callers arriving together used to make four
// identical requests (lib/ttl-memo.ts).
const costsMemo = ttlMemo<FixedDailyCosts>(CACHE_TTL)

/**
 * Fetch fixed daily costs (water bottles) from the database.
 * Uses a 5-minute in-memory cache to avoid repeated DB queries.
 * Falls back to hardcoded defaults if the table is empty or DB is unavailable.
 *
 * NOTE: Tipping is handled separately via the tipping_rates table —
 * use getTippingRate() from lib/auto-pricing-service.ts for tips.
 */
export async function getFixedDailyCosts(): Promise<FixedDailyCosts> {
  try {
    return await costsMemo('all', loadFixedDailyCosts)
  } catch (err: any) {
    // The fallback is NOT remembered: a database that was briefly unreachable
    // must not pin every quote to the built-in default for the next five
    // minutes. ttlMemo drops a failed read, so the next caller tries again.
    console.warn('[FixedCosts] Falling back to defaults:', err?.message)
    return { waterPerPersonPerDay: DEFAULTS['Water Bottle'] }
  }
}

/** Throws rather than falling back, so a failure is never cached. */
async function loadFixedDailyCosts(): Promise<FixedDailyCosts> {
  {
    const { data: rawData, error } = await getSupabaseAdmin()
      .from('fixed_daily_costs')
      .select('*')
      .eq('is_active', true)
    const data = await normalizeRateRows(getSupabaseAdmin(), 'fixed_daily_costs', rawData)

    if (error) throw new Error(`fixed_daily_costs query failed: ${error.message}`)

    const findRate = (type: string) => {
      const record = ((data as any[]) || []).find((r: any) => r.cost_type === type)
      return record?.cost_per_person_per_day ?? DEFAULTS[type as keyof typeof DEFAULTS] ?? 0
    }

    const costs: FixedDailyCosts = {
      waterPerPersonPerDay: findRate('Water Bottle'),
    }

    return costs
  }
}

/** Clear the cache (e.g. after updating rates via the admin API) */
export function clearFixedCostsCache() {
  costsMemo.clear()
}
