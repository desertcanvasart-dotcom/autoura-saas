// ============================================================================
// tour_variation_options — priced upgrades that belong to ONE variation
// ============================================================================
// Migration 319. Same money model as catalogue extras: supplier_cost is what
// we pay (NULL = not quoted, never zero), selling_price set = the price as-is,
// blank = cost plus the quote's margin. Priced at quote time through
// lib/pricing/extras-pricing.ts, never by a second mechanism.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database.types'

export const OPTION_COLS =
  'id, tenant_id, variation_id, name, description, supplier_cost, selling_price, unit, is_active, sort_order, created_at, updated_at'

export const OPTION_WRITABLE = [
  'name', 'description', 'supplier_cost', 'selling_price', 'unit', 'is_active', 'sort_order',
] as const

export type VariationOption = Tables<'tour_variation_options'>

/** A blank number field means "not priced", never 0 — the unpriced-rates rule. */
export function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Keep only writable keys; coerce the money fields; leave the rest as sent. */
export function pickOptionWritable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of OPTION_WRITABLE) {
    if (!(k in body)) continue
    out[k] = k === 'supplier_cost' || k === 'selling_price' ? numberOrNull(body[k]) : body[k]
  }
  return out
}

export function isUnit(v: unknown): v is 'per_person' | 'per_booking' {
  return v === 'per_person' || v === 'per_booking'
}

/** The options table on any typed Supabase client (user or service-role). */
export function optionsTable(client: SupabaseClient<Database>) {
  return client.from('tour_variation_options')
}
