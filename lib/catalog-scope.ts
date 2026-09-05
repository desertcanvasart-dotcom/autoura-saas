// ============================================
// Catalog scope — RETIRED (2026-09-05): rates are tenant-owned, full stop
// ============================================
// Seven rate tables used to carry migration-seeded GLOBAL rows
// (tenant_id IS NULL) that tenants read merged with their own, gated by
// tenant_features.use_global_catalog (migration 260). In practice the
// shared rows were pure confusion — rates nobody in the company entered,
// wearing nobody's contract — so migration 331 deleted them, dropped the
// flag, and rewrote the read policies to plain tenant isolation. Each
// company enters or CSV-imports its own rates; a missing rate is a named
// hole, never a platform default.
//
// This module survives as the single place service-role reads build their
// tenant filter, so RLS and code cannot drift apart.

export interface CatalogScope {
  tenantId: string
}

/**
 * Resolve a tenant's rate scope. The client parameter is kept for call-site
 * stability (this used to read tenant_features.use_global_catalog); nothing
 * is read any more.
 */
export async function getCatalogScope(_client: unknown, tenantId: string): Promise<CatalogScope> {
  return { tenantId }
}

/**
 * The PostgREST `.or()` expression scoping a rate-table query to the
 * tenant's own rows. Usage: `.or(catalogOrExpr(scope))` after `.select()`.
 * (Kept as an `.or()` for call-site stability — it is a single-clause
 * tenant filter now.)
 */
export function catalogOrExpr(scope: CatalogScope): string {
  return `tenant_id.eq.${scope.tenantId}`
}

/** The seven tables that USED to carry shared NULL rows — retained for the
 *  guard test that proves no global rows ever come back. */
export const CATALOG_TABLES = [
  'entrance_fees',
  'flight_rates',
  'train_rates',
  'tipping_rates',
  'hotel_staff_rates',
  'airport_staff_rates',
  'sleeping_train_rates',
] as const
