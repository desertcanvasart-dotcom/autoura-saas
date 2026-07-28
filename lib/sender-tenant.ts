import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// WHO AN OUTBOUND MESSAGE IS FROM
// ============================================
// Every send path (WhatsApp, email, supplier documents, template rendering)
// needs the operator's identity. They all fetched it the same way — and all
// had the same two flaws.
//
// 1. THE SESSION CLIENT IS BLIND UNDER IMPERSONATION.
//    requireAuth() returns the IMPERSONATED tenant_id but the REAL user's
//    RLS client. The tenants SELECT policy is `id = get_user_tenant_id()`,
//    which resolves via tenant_members for auth.uid() — and a super admin is
//    not a member of the tenant they are impersonating. The row comes back
//    empty, so support resends an invoice and the customer receives a message
//    signed "Best regards," with no company at all, having already billed
//    Twilio.
//
// 2. THE ERROR WAS DISCARDED. `const { data: senderTenant } = await ...`
//    makes "RLS hid it", "the row is missing" and "the query failed" all look
//    identical — the silent-empty pattern that hid this for weeks.
//
// The admin client is correct here BECAUSE the query is pinned to
// auth.tenant_id, which requireAuth already resolved and validated. Reading
// one's own tenant identity is not a privilege escalation; being unable to
// read it is a bug.

export interface SenderTenant {
  company_name: string | null
  contact_email: string | null
  company_phone: string | null
  company_website: string | null
  primary_color: string | null
  logo_url: string | null
}

const COLUMNS =
  'company_name, contact_email, company_phone, company_website, primary_color, logo_url'

/**
 * The tenant an outbound message is sent AS.
 *
 * Returns null only when the tenant genuinely has no row. A query failure is
 * logged loudly rather than being flattened into a blank sender.
 */
export async function loadSenderTenant(
  tenantId: string | null | undefined
): Promise<SenderTenant | null> {
  if (!tenantId) {
    console.error('loadSenderTenant: called without a tenant id')
    return null
  }

  const { data, error } = await createAdminClient()
    .from('tenants')
    .select(COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()

  if (error) {
    // Loud on purpose: the caller is about to send something on this
    // tenant's behalf, and a blank company name reaches a real customer.
    console.error(`loadSenderTenant(${tenantId}) failed:`, error.message)
    return null
  }

  return (data as SenderTenant | null) ?? null
}
