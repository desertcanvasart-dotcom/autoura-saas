// ============================================
// Catalog scope — tenant visibility of global catalog rows
// ============================================
// The seven rate-catalog tables carry migration-seeded GLOBAL rows
// (tenant_id IS NULL) that tenants read merged with their own rows.
// Migration 260 made that merge conditional on
// tenant_features.use_global_catalog, enforced in RLS for authenticated
// clients. Code that reads rates through the SERVICE-ROLE client bypasses
// RLS, so it must apply the same rule explicitly — through this module,
// never inline, so the two layers cannot drift apart.
//
// Missing tenant_features row → true, matching get_use_global_catalog()'s
// COALESCE in migration 260.

export interface CatalogScope {
  tenantId: string
  useGlobalCatalog: boolean
}

/** The slice of a Supabase client this module needs. PromiseLike, not
 * Promise — supabase-js query builders are thenables. */
interface FeaturesReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{
          data: { use_global_catalog?: boolean } | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/**
 * Resolve a tenant's catalog scope. `client` must be able to read
 * tenant_features for that tenant (service-role, or the tenant's own RLS
 * client). Typed `unknown` at the boundary: structurally matching the full
 * SupabaseClient generic trips TS2589 (excessively deep instantiation), so
 * the narrow contract is asserted internally instead.
 */
export async function getCatalogScope(client: unknown, tenantId: string): Promise<CatalogScope> {
  const { data, error } = await (client as FeaturesReader)
    .from('tenant_features')
    .select('use_global_catalog')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    // Fail toward today's default (shared catalog visible) but never silently:
    // a broken lookup must not make every tenant's rates vanish.
    console.error('getCatalogScope: tenant_features read failed, defaulting to shared catalog:', error.message)
    return { tenantId, useGlobalCatalog: true }
  }
  return { tenantId, useGlobalCatalog: data?.use_global_catalog ?? true }
}

/**
 * The PostgREST `.or()` expression applying tenant visibility to a
 * rate-table query: with the flag on, the tenant's own rows merge with the
 * global catalog; with it off, only the tenant's rows match. Non-catalog
 * rate tables have no NULL rows, so applying this uniformly is a plain
 * tenant filter there. Usage: `.or(catalogOrExpr(scope))` after `.select()`.
 */
export function catalogOrExpr(scope: CatalogScope): string {
  return scope.useGlobalCatalog
    ? `tenant_id.eq.${scope.tenantId},tenant_id.is.null`
    : `tenant_id.eq.${scope.tenantId}`
}

/** The seven tables whose NULL rows form the shared global catalog. */
export const CATALOG_TABLES = [
  'entrance_fees',
  'flight_rates',
  'train_rates',
  'tipping_rates',
  'hotel_staff_rates',
  'airport_staff_rates',
  'sleeping_train_rates',
] as const
