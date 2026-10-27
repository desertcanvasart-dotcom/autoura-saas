// ============================================
// A lead for a company: the existing client, else a new one
// ============================================
// One rule for every door a lead comes in by (the concierge brief, the
// Publish enquiry form): the company's client with this email, else with this
// phone, else a new client row. Lookups are scoped to the company explicitly,
// because callers use the service connection, which bypasses RLS.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LeadMatch {
  email: string | null
  phone: string | null
}

/** The client's id, or null when the new row could not be written. */
export async function findOrCreateLead(
  supabase: SupabaseClient,
  tenantId: string,
  match: LeadMatch,
  newClient: Record<string, unknown>,
  logPrefix = '[lead]',
): Promise<string | null> {
  if (match.email) {
    const { data } = await supabase.from('clients').select('id').eq('tenant_id', tenantId).eq('email', match.email).limit(1).maybeSingle()
    if (data?.id) return data.id
  }
  if (match.phone) {
    const { data } = await supabase.from('clients').select('id').eq('tenant_id', tenantId).eq('phone', match.phone).limit(1).maybeSingle()
    if (data?.id) return data.id
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({ ...newClient, tenant_id: tenantId })
    .select('id')
    .single()

  if (error) {
    console.error(`${logPrefix} client insert failed:`, error.message)
    return null
  }
  return created.id
}
