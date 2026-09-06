// ============================================
// Tenant vocabulary, read on the server
// ============================================
// Routes that need the agency's lists — to validate a stored key or to widen
// a "type=hotel" filter to every supplier type that BEHAVES as a hotel.
// Always through the caller's RLS-bound client, so the answer is the
// caller's tenant and nothing else.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { activeInOrder, type VocabularyItem, type VocabularyKind } from '@/lib/vocabulary'

type Client = SupabaseClient<Database>

/** Every entry of one kind (hidden included). Empty when migration 334 is
 *  not applied — callers keep their built-in behaviour. */
export async function loadVocabulary(supabase: Client, kind: VocabularyKind): Promise<VocabularyItem[]> {
  const { data, error } = await supabase
    .from('tenant_vocabularies')
    .select('id, tenant_id, kind, key, label, description, behavior, rank, meta, is_active, created_at, updated_at')
    .eq('kind', kind)
    .order('rank')
  if (error || !data) return []
  return data as unknown as VocabularyItem[]
}

/** Active keys of one kind, in order. */
export async function activeKeys(supabase: Client, kind: VocabularyKind): Promise<string[]> {
  return activeInOrder(await loadVocabulary(supabase, kind)).map(i => i.key)
}

/**
 * The supplier-type KEYS a "type=hotel" filter should match: every entry
 * whose behaviour is one of `behaviors`, plus the behaviour names themselves
 * (rows written before the vocabulary existed store the behaviour as the
 * type). A tenant's "boutique_hotel" that behaves as `hotel` is a hotel to
 * the hotel rates page.
 */
export async function supplierTypeKeysForBehaviors(supabase: Client, behaviors: string[]): Promise<string[]> {
  const wanted = new Set(behaviors.map(b => b.trim()).filter(Boolean))
  const out = new Set<string>(wanted)
  for (const item of await loadVocabulary(supabase, 'supplier_type')) {
    if (item.behavior && wanted.has(item.behavior)) out.add(item.key)
    if (wanted.has(item.key)) out.add(item.key)
  }
  return [...out]
}

// ------------------------------------------------------------------
// Service-role reads (the pricing engine, cron): explicit tenant
// ------------------------------------------------------------------

import { PRESET_TIERS, type VehicleBand } from '@/lib/vocabulary'

/** Every entry of one kind for a NAMED tenant, through a service-role
 *  client. Only for code that already holds a tenant it has authorised. */
export async function loadVocabularyForTenant(admin: Client, tenantId: string, kind: VocabularyKind): Promise<VocabularyItem[]> {
  const { data, error } = await admin
    .from('tenant_vocabularies')
    .select('id, tenant_id, kind, key, label, description, behavior, rank, meta, is_active, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('rank')
  if (error || !data) return []
  return data as unknown as VocabularyItem[]
}

/** The tenant's word for each stored key of one kind — hidden entries
 *  included, so a rate filed under a class the agency has since retired
 *  still reads as a word, not a slug. Empty when the tenant has none. */
export async function vocabularyLabelsForTenant(admin: Client, tenantId: string, kind: VocabularyKind): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const item of await loadVocabularyForTenant(admin, tenantId, kind)) out.set(item.key, item.label)
  return out
}

/** The tenant's tiers, lowest to highest — the preset when none exist. */
export async function tierLadderForTenant(admin: Client, tenantId: string): Promise<string[]> {
  const keys = activeInOrder(await loadVocabularyForTenant(admin, tenantId, 'tier')).map(i => i.key)
  return keys.length ? keys : [...PRESET_TIERS]
}

/** The tenant's vehicles with their passenger bands, smallest first. Empty
 *  when the tenant has none (callers keep their built-in bands). */
export async function vehicleBandsForTenant(admin: Client, tenantId: string): Promise<VehicleBand[]> {
  return activeInOrder(await loadVocabularyForTenant(admin, tenantId, 'vehicle_type'))
    .map(i => ({ key: i.key, min_pax: Number(i.meta?.min_pax ?? 0), max_pax: Number(i.meta?.max_pax ?? 0) }))
    .filter(v => v.max_pax > 0)
}
