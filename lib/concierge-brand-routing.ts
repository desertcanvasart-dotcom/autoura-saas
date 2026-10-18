// ============================================
// CONCIERGE BRAND -> TENANT ROUTING
// ============================================
// Resolves which tenant an inbound concierge brief belongs to, and
// whether that tenant has the concierge feature enabled.
//
// Resolution order:
//   1. payload `brand`  -> concierge_brand_mappings (must exist + active;
//                          an unmapped brand is a 422, never a fallback —
//                          briefs must not silently land in the wrong tenant)
//   2. no brand         -> CONCIERGE_WEBHOOK_TENANT_ID env (legacy v1 path)
//   3. no brand, no env -> oldest tenant (single-tenant installs)
//
// Feature gate: the resolved tenant must have
// tenant_features.concierge_enabled = true (default false — the
// concierge is an add-on toggled from super-admin). Fail closed: a
// missing features row counts as disabled.
//
// The Supabase client is injected so tests can stub it (same pattern as
// lib/concierge-webhook-auth.ts taking `secrets`/`nowSeconds`).
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBrandKey } from '@/lib/concierge-brief-schema'

export type RoutingVia = 'brand_mapping' | 'env'

export type RoutingResult =
  | { ok: true; tenantId: string; via: RoutingVia; brand: string | null }
  | { ok: false; code: 'unknown_brand' | 'inactive_brand' | 'no_tenant'; message: string }

type Db = SupabaseClient<any, any, any, any, any>

export async function resolveConciergeTenant(
  supabase: Db,
  brand: unknown,
  env: Record<string, string | undefined> = process.env
): Promise<RoutingResult> {
  const key = normalizeBrandKey(brand)

  if (key) {
    const { data } = await supabase
      .from('concierge_brand_mappings')
      .select('tenant_id, active')
      .eq('brand_key', key)
      .maybeSingle()

    if (!data) {
      return {
        ok: false,
        code: 'unknown_brand',
        message: `No tenant mapping for brand "${key}". Create one in super-admin (concierge brand mappings).`,
      }
    }
    if (!data.active) {
      return {
        ok: false,
        code: 'inactive_brand',
        message: `Brand "${key}" is mapped but deactivated.`,
      }
    }
    return { ok: true, tenantId: data.tenant_id as string, via: 'brand_mapping', brand: key }
  }

  const configured = env.CONCIERGE_WEBHOOK_TENANT_ID
  if (configured) return { ok: true, tenantId: configured, via: 'env', brand: null }

  // No "oldest company" fallback: with more than one company that put a
  // traveller's details into whichever signed up first. Unrouted = refused.
  return { ok: false, code: 'no_tenant', message: 'No tenant configured to receive briefs: send a brand, or set CONCIERGE_WEBHOOK_TENANT_ID.' }
}

/** Fail closed: no features row (or concierge_enabled != true) => disabled. */
export async function isConciergeEnabled(supabase: Db, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_features')
    .select('concierge_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data?.concierge_enabled === true
}
