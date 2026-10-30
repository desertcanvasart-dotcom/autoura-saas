// ============================================
// Which agencies' supplier records a phone belongs to (Phase 2B)
// ============================================
// Server only, service role. Narrow by the phone's last digits in the
// database, then check exactly with each agency's country
// (lib/supplier-accounts recordMatchesPhone) — a local number is read the way
// that agency wrote it, never guessed.

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneTail, recordMatchesPhone } from '@/lib/supplier-accounts'

export interface MatchedRecord {
  id: string
  tenant_id: string
  name: string | null
  email: string | null
  contact_email: string | null
}

export async function recordsForPhone(db: SupabaseClient, phone: string): Promise<MatchedRecord[]> {
  const tail = phoneTail(phone)
  // Digits may be written with spaces or dashes; match the tail loosely, check exactly below.
  const loose = `%${tail.split('').join('%')}%`
  const { data: rows } = await db.from('suppliers')
    .select('id, tenant_id, name, company_name, email, contact_email, whatsapp, phone, contact_phone, is_active')
    .or(`whatsapp.ilike.${loose},phone.ilike.${loose},contact_phone.ilike.${loose}`)
    .limit(200)
  const candidates = (rows ?? []).filter(r => r.is_active !== false && r.tenant_id)
  if (candidates.length === 0) return []
  const tenantIds = [...new Set(candidates.map(r => r.tenant_id as string))]
  const { data: tenants } = await db.from('tenants').select('id, operating_country').in('id', tenantIds)
  const countryOf = new Map((tenants ?? []).map(t => [t.id as string, (t.operating_country as string | null) ?? null]))
  return candidates
    .filter(r => recordMatchesPhone(r, countryOf.get(r.tenant_id as string), phone))
    .map(r => ({
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      name: ((r.name || r.company_name) as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      contact_email: (r.contact_email as string | null) ?? null,
    }))
}

/** On sign-in: a pending claim for every matched record not yet claimed by this account. */
export async function claimRecords(db: SupabaseClient, accountId: string, records: MatchedRecord[]): Promise<number> {
  if (records.length === 0) return 0
  const { data, error } = await db.from('supplier_account_links').upsert(
    records.map(r => ({ account_id: accountId, tenant_id: r.tenant_id, supplier_id: r.id })),
    { onConflict: 'account_id,supplier_id', ignoreDuplicates: true },
  ).select('id')
  if (error) { console.error('[supplier claims]', error.message); return 0 }
  return (data ?? []).length
}
