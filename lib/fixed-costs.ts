import { createClient } from '@supabase/supabase-js'
import { normalizeRateRows } from '@/lib/rates/rate-currency'
import { ttlMemo } from '@/lib/ttl-memo'

// Lazy-initialized service-role client — the pricing engine reads fixed costs
// server-side. Lazy init mirrors auto-pricing-service's getSupabaseAdmin()
// pattern and avoids build-time/import errors when env vars are absent.
// (it reads every tenant's active rows, then keeps the caller's own and the
// shared ones — see loadFixedDailyCosts.)
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

/** The water cost per person per day when a company has not set its own
 *  "Water Bottle" fixed cost — shared by the pricing engine and the grid. */
export const DEFAULT_WATER_PER_PERSON_PER_DAY = DEFAULTS['Water Bottle']

/** The fixed_daily_costs row that prices water: cost_type "Water Bottle"
 *  (matched loosely, as operators type it). */
export function isWaterCostType(costType: unknown): boolean {
  return typeof costType === 'string' && /water/i.test(costType)
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
export async function getFixedDailyCosts(tenantId?: string | null, runCurrency?: string): Promise<FixedDailyCosts> {
  try {
    return await costsMemo(`${tenantId ?? '-'}|${runCurrency ?? '-'}`, () => loadFixedDailyCosts(tenantId ?? null, runCurrency))
  } catch (err: any) {
    // The fallback is NOT remembered: a database that was briefly unreachable
    // must not pin every quote to the built-in default for the next five
    // minutes. ttlMemo drops a failed read, so the next caller tries again.
    console.warn('[FixedCosts] Falling back to defaults:', err?.message)
    return { waterPerPersonPerDay: DEFAULTS['Water Bottle'] }
  }
}

/** Throws rather than falling back, so a failure is never cached.
 *
 *  THIS company's water row, else the shared one (tenant_id null) — the same
 *  rule the pricing grid uses (lib/pricing/grid-rates.ts). It read every
 *  tenant's rows under the service key and took the first "Water Bottle" it
 *  met, so one agency's price set another's, and the Quote Builder and the
 *  rate sheet disagreed about water. Converted into the run currency. */
async function loadFixedDailyCosts(tenantId: string | null, runCurrency?: string): Promise<FixedDailyCosts> {
  const { data: rawData, error } = await getSupabaseAdmin()
    .from('fixed_daily_costs')
    .select('*')
    .eq('is_active', true)
  if (error) throw new Error(`fixed_daily_costs query failed: ${error.message}`)

  type CostRow = { tenant_id?: string | null; cost_type?: unknown; cost_per_person_per_day?: number | null } & Record<string, unknown>
  const visible = ((rawData ?? []) as CostRow[]).filter(r => r.tenant_id == null || (tenantId != null && r.tenant_id === tenantId))
  const data = await normalizeRateRows(getSupabaseAdmin(), 'fixed_daily_costs', visible, runCurrency)
  const water = data.filter(r => isWaterCostType(r.cost_type))
  const record = water.find(r => tenantId != null && r.tenant_id === tenantId) ?? water[0]
  return { waterPerPersonPerDay: record?.cost_per_person_per_day ?? DEFAULTS['Water Bottle'] }
}

/** Clear the cache (e.g. after updating rates via the admin API) */
export function clearFixedCostsCache() {
  costsMemo.clear()
}
