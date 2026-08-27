// ============================================
// TENANT RUN CURRENCY (C3.4)
// ============================================
// The one currency a tenant's stored rates are denominated in and its
// pricing runs in. Historically hard-coded EUR (the *_eur column names);
// now tenants.rates_currency (migration 298), NULL = EUR. Per-rate
// rate_currency (migration 295) still overrides row by row — the
// fetch-boundary normalizer converts those INTO this currency.

export const DEFAULT_RUN_CURRENCY = 'EUR'

interface TenantReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown }>
      }
    }
  }
}

let cache: Map<string, { value: string; at: number }> = new Map()
const CACHE_MS = 60_000

/** Test seam. */
export function clearRunCurrencyCache() {
  cache = new Map()
}

/**
 * Resolve a tenant's run currency. Never throws; a database without
 * migration 298 (no rates_currency key on the row), a missing tenant, or
 * any read failure all resolve to EUR — byte-identical to the historical
 * behaviour.
 */
export async function getTenantRunCurrency(db: object, tenantId: string): Promise<string> {
  const hit = cache.get(tenantId)
  const now = Date.now()
  if (hit && now - hit.at < CACHE_MS) return hit.value
  try {
    const { data } = await (db as TenantReader)
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle()
    const row = data as Record<string, unknown> | null
    const value =
      row && typeof row.rates_currency === 'string' && row.rates_currency
        ? row.rates_currency
        : DEFAULT_RUN_CURRENCY
    cache.set(tenantId, { value, at: now })
    return value
  } catch {
    return hit?.value ?? DEFAULT_RUN_CURRENCY
  }
}
