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

/** On sign-in: a pending claim for every matched record not yet claimed by this account. Returns the NEW claims. */
export async function claimRecords(
  db: SupabaseClient,
  accountId: string,
  records: MatchedRecord[],
): Promise<Array<{ id: string; tenant_id: string; supplier_id: string }>> {
  if (records.length === 0) return []
  const { data, error } = await db.from('supplier_account_links').upsert(
    records.map(r => ({ account_id: accountId, tenant_id: r.tenant_id, supplier_id: r.id })),
    { onConflict: 'account_id,supplier_id', ignoreDuplicates: true },
  ).select('id, tenant_id, supplier_id')
  if (error) { console.error('[supplier claims]', error.message); return [] }
  return (data ?? []) as Array<{ id: string; tenant_id: string; supplier_id: string }>
}

/**
 * Where the sign-in code behind a claim went, as one agency may see it (audit
 * SN-1). The code goes to every email any agency typed on a record with this
 * phone, so another agency could have typed its OWN address and signed in.
 * The approving agency is shown only the addresses that are on its own
 * record, and a count of the rest — never another agency's addresses or name.
 * `sentTo` is supplier_login_codes.sent_to (comma-separated).
 */
export function codeRecipientsForAgency(
  sentTo: string | null | undefined,
  ownRecord: { email?: string | null; contact_email?: string | null } | null | undefined,
): { yours: string[]; others: number } | null {
  if (!sentTo) return null
  const sent = [...new Set(sentTo.split(',').map(e => e.trim().toLowerCase()).filter(Boolean))]
  if (sent.length === 0) return null
  const own = new Set([ownRecord?.email, ownRecord?.contact_email].map(e => (e ?? '').trim().toLowerCase()).filter(Boolean))
  const yours = sent.filter(e => own.has(e))
  return { yours, others: sent.length - yours.length }
}

/** The used code that made a claim: the latest one used by the time it was asked for (else the latest). */
export function codeForClaim<T extends { account_id: string; used_at: string }>(
  codes: T[],
  claim: { account_id: string; requested_at: string },
): T | null {
  const mine = codes.filter(c => c.account_id === claim.account_id).sort((a, b) => Date.parse(b.used_at) - Date.parse(a.used_at))
  const by = Date.parse(claim.requested_at) + 60_000
  return mine.find(c => Date.parse(c.used_at) <= by) ?? mine[0] ?? null
}

/** Who may confirm a claim: an agency's owners and admins (decision §9). */
export const CLAIM_DECIDERS = ['owner', 'admin']

export type ClaimDecision = 'approve' | 'reject'

/** pending → approved / rejected; approved → rejected (disconnect); rejected → approved (reconnect). */
export function claimNextStatus(current: string, decision: unknown): { ok: true; status: 'approved' | 'rejected' } | { ok: false; error: string } {
  if (decision !== 'approve' && decision !== 'reject') return { ok: false, error: 'Choose confirm or not them' }
  const to = decision === 'approve' ? 'approved' : 'rejected'
  if (current === to) return { ok: false, error: to === 'approved' ? 'Already connected' : 'Already not connected' }
  return { ok: true, status: to }
}
