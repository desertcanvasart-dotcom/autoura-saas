// ============================================
// Preferred rate rows — one per scope (migrations 353/354)
// ============================================
// is_preferred is the engine's tie-breaker among several candidates in one
// city + tier (lib/pricing/candidate-selection.ts): exactly one preferred row
// is used; none or several is a pricing hole. So SETTING the flag on a row
// must clear it on that row's siblings. The scopes here mirror the engine's
// candidate pools and the partial unique indexes in migration 354.

export type PreferredTable = 'accommodation_rates' | 'nile_cruises' | 'meal_rates' | 'guides'

interface ScopeDef {
  /** Columns that define "the same scope". Text columns compare case-insensitively. */
  columns: string[]
  /** The column naming the row in messages. */
  nameColumn: string
  /** Where the operator manages these rows. */
  page: string
}

export const PREFERRED_SCOPES: Record<PreferredTable, ScopeDef> = {
  accommodation_rates: { columns: ['city', 'tier'], nameColumn: 'property_name', page: 'Rates → Hotels' },
  nile_cruises: { columns: ['tier'], nameColumn: 'ship_name', page: 'Rates → Cruises' },
  meal_rates: { columns: ['tier', 'meal_type'], nameColumn: 'restaurant_name', page: 'Rates → Meals' },
  // Guides: the engine also filters by language (an array), so one preferred
  // guide per language is legitimate. Siblings are cleared by tier only when
  // the languages overlap — approximated here as "same tier", which is what
  // the roster page can express. No unique index (migration 354).
  guides: { columns: ['tier'], nameColumn: 'name', page: 'CRM → Guides' },
}

export function isPreferredTable(t: unknown): t is PreferredTable {
  return typeof t === 'string' && t in PREFERRED_SCOPES
}

/** Human description of a scope, for toasts: "standard · Cairo". */
export function describeScope(table: PreferredTable, row: Record<string, unknown>): string {
  return PREFERRED_SCOPES[table].columns
    .map(c => row[c])
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(String)
    .join(' · ')
}

// The subset of the supabase query builder this needs — keeps the helper
// usable with the RLS-bound client, the admin client, and the test mock.
interface UpdateBuilder {
  eq(column: string, value: unknown): UpdateBuilder
  neq(column: string, value: unknown): UpdateBuilder
  is(column: string, value: null): UpdateBuilder
  ilike(column: string, pattern: string): UpdateBuilder
  then<T>(onfulfilled: (r: { error: { message: string } | null }) => T): Promise<T>
}
interface MinimalClient {
  from(table: string): { update(values: Record<string, unknown>): UpdateBuilder }
}

/**
 * Clear is_preferred on every OTHER row in `row`'s scope, so the row about to
 * be flagged becomes the only preferred one. Call it before writing
 * is_preferred = true; a no-op when the flag is being cleared.
 */
export async function clearPreferredSiblings(
  client: unknown,
  table: PreferredTable,
  tenantId: string,
  row: Record<string, unknown>,
  excludeId: string
): Promise<{ error: string | null }> {
  let q = (client as MinimalClient)
    .from(table)
    .update({ is_preferred: false })
    .eq('tenant_id', tenantId)
    .eq('is_preferred', true)
    .neq('id', excludeId)
  for (const col of PREFERRED_SCOPES[table].columns) {
    const v = row[col]
    if (v === null || v === undefined || v === '') q = q.is(col, null)
    // ilike with no wildcards = case-insensitive equality (the index lowers too).
    else q = q.ilike(col, String(v).replace(/[%_]/g, m => `\\${m}`))
  }
  const { error } = await q
  return { error: error ? error.message : null }
}
