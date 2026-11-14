// ============================================
// Preferred rate rows — one per scope (migrations 353/354)
// ============================================
// is_preferred is the engine's tie-breaker among several candidates in one
// city + tier (lib/pricing/candidate-selection.ts): exactly one preferred row
// is used; none or several is a pricing hole. So SETTING the flag on a row
// must clear it on that row's siblings. The scopes here mirror the engine's
// candidate pools and the partial unique indexes in migration 354.

import { mealsOverlap } from '@/lib/meals/meal-rate-meals'

export type PreferredTable = 'accommodation_rates' | 'nile_cruises' | 'meal_rates' | 'guides' | 'transportation_rates'

interface ScopeDef {
  /** Columns that define "the same scope". Text columns compare case-insensitively. */
  columns: string[]
  /** The column naming the row in messages. */
  nameColumn: string
  /** Where the operator manages these rows. */
  page: string
  /** Further columns the scope reads beside `columns` (a list an index
   *  cannot compare): a meal price's further meals (migration 467). */
  listColumns?: string[]
}

export const PREFERRED_SCOPES: Record<PreferredTable, ScopeDef> = {
  accommodation_rates: { columns: ['city', 'tier'], nameColumn: 'property_name', page: 'Rates → Hotels' },
  nile_cruises: { columns: ['tier'], nameColumn: 'ship_name', page: 'Rates → Cruises' },
  // Meals: one preferred restaurant per tier AND meal. A price may cover
  // several meals (migration 467), so its star clears every starred price in
  // the tier that shares a meal with it — see clearPreferredMealSiblings.
  meal_rates: { columns: ['tier', 'meal_type'], listColumns: ['other_meal_types'], nameColumn: 'restaurant_name', page: 'Rates → Meals' },
  // Guides: the engine also filters by language (an array), so one preferred
  // guide per language is legitimate. Siblings are cleared by tier only when
  // the languages overlap — approximated here as "same tier", which is what
  // the roster page can express. No unique index (migration 354).
  guides: { columns: ['tier'], nameColumn: 'name', page: 'CRM → Guides' },
  // Transport (migration 460): several companies may price the same route and
  // vehicle; the star picks the company. The scope is what the engine matches
  // a journey on — NOT the route's name or its company. One row per vehicle,
  // so starring a route stars each of its vehicle rows. No unique index: a
  // company's several named routes in one city may all carry its star, and
  // the engine reads the star per COMPANY (lib/pricing/transport-suppliers.ts).
  transportation_rates: {
    columns: ['service_type', 'city', 'origin_city', 'destination_city', 'duration', 'area', 'vehicle_type'],
    nameColumn: 'route_name',
    page: 'Rates → Transportation',
  },
}

export function isPreferredTable(t: unknown): t is PreferredTable {
  return typeof t === 'string' && t in PREFERRED_SCOPES
}

/** Human description of a scope, for toasts: "standard · Cairo". */
export function describeScope(table: PreferredTable, row: Record<string, unknown>): string {
  const scope = PREFERRED_SCOPES[table]
  return [...scope.columns.map(c => row[c]), ...(scope.listColumns ?? []).flatMap(c => (Array.isArray(row[c]) ? row[c] as unknown[] : []))]
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
  if (table === 'meal_rates') return clearPreferredMealSiblings(client, tenantId, row, excludeId)
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

// ---- Meals: the scope is a list ---------------------------------------------
interface MealReadBuilder {
  eq(column: string, value: unknown): MealReadBuilder
  neq(column: string, value: unknown): MealReadBuilder
  is(column: string, value: null): MealReadBuilder
  ilike(column: string, pattern: string): MealReadBuilder
  then<T>(onfulfilled: (r: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => T): Promise<T>
}
interface MealWriteBuilder {
  eq(column: string, value: unknown): MealWriteBuilder
  in(column: string, values: string[]): MealWriteBuilder
  then<T>(onfulfilled: (r: { error: { message: string } | null }) => T): Promise<T>
}
interface MealClient {
  from(table: string): {
    select(columns: string): MealReadBuilder
    update(values: Record<string, unknown>): MealWriteBuilder
  }
}

/**
 * A meal price covers one meal or several (migration 467), and the engine
 * picks one restaurant per tier AND meal. So starring a price clears the star
 * on every other price in its tier that serves any of the same meals — a
 * "lunch and dinner" star clears both the lunch star and the dinner star.
 */
export async function clearPreferredMealSiblings(
  client: unknown,
  tenantId: string,
  row: Record<string, unknown>,
  excludeId: string
): Promise<{ error: string | null }> {
  const db = client as MealClient
  let q = db
    .from('meal_rates')
    .select('id, meal_type, other_meal_types')
    .eq('tenant_id', tenantId)
    .eq('is_preferred', true)
    .neq('id', excludeId)
  const tier = row.tier
  if (tier === null || tier === undefined || tier === '') q = q.is('tier', null)
  else q = q.ilike('tier', String(tier).replace(/[%_]/g, m => `\\${m}`))
  const { data, error } = await q
  if (error) return { error: error.message }
  const ids = (data ?? []).filter(other => mealsOverlap(row, other)).map(other => String(other.id))
  if (ids.length === 0) return { error: null }
  const cleared = await db.from('meal_rates').update({ is_preferred: false }).eq('tenant_id', tenantId).in('id', ids)
  return { error: cleared.error ? cleared.error.message : null }
}
