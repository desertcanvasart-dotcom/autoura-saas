// ============================================
// Is this email address the agency's own?
// ============================================
// A client's email must never be the office's. Tersa's itinerary
// (ITN-S-2026-8987) carried the admin's own address: "Price in Grid" from
// the inbox fills the client's email from the message's From, and from a
// message the office sent (a reply, a forward) that is the office. Saved, it
// became the client's — and the client record matched by it.
//
// The office's addresses: the connected mailboxes and Settings → Email →
// Office addresses (lib/email/office-addresses: also the mailbox's own
// domain, unless a public one), and every team member's and the signed-in
// user's own email. Pure — the loader below gathers them.

import type { SupabaseClient } from '@supabase/supabase-js'
import { bareAddress, isOfficeAddress, officeRule } from './office-addresses'

export interface OwnAddresses {
  mailboxes: readonly string[]
  configured: readonly string[]
  people: readonly string[]
}

export function isOwnAddress(own: OwnAddresses, value: string | null | undefined): boolean {
  const a = bareAddress(value)
  if (!a.includes('@')) return false
  if (own.people.some(p => bareAddress(p) === a)) return true
  return isOfficeAddress(officeRule(own.mailboxes, own.configured), a)
}

/** What a request can see of the office's addresses (RLS scopes each read). */
export async function loadOwnAddresses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  user: { id?: string | null; email?: string | null } | null | undefined,
): Promise<OwnAddresses> {
  const [members, tenant, tokens] = await Promise.all([
    supabase.from('team_members').select('email').eq('tenant_id', tenantId),
    supabase.from('tenants').select('office_email_addresses').eq('id', tenantId).maybeSingle(),
    user?.id ? supabase.from('gmail_tokens').select('email').eq('user_id', user.id) : Promise.resolve({ data: [] as { email: string | null }[] }),
  ])
  const people = [
    ...((members.data ?? []) as { email: string | null }[]).map(m => m.email ?? ''),
    user?.email ?? '',
  ].filter(Boolean)
  return {
    mailboxes: ((tokens.data ?? []) as { email: string | null }[]).map(t => t.email ?? '').filter(Boolean),
    configured: ((tenant.data as { office_email_addresses?: string[] | null } | null)?.office_email_addresses ?? []),
    people,
  }
}
