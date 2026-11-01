// ============================================
// A supplier's token → the link it opens (server only, service role)
// ============================================
// The supplier has no login: the token in the URL is the credential. Every
// page and route that takes one resolves it here, so the rules live once
// (audit SN-12): a malformed token, a revoked link or (reply links) one past
// its expiry resolves to null — the caller answers 404.
//
//   supplier_portal_links (449) — the supplier's own page: one supplier at one agency.
//   service_booking_links (448) — one request: one line of one booking.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidSupplierPageToken } from '@/lib/supplier-portal'
import { isLinkLive, isValidReplyToken } from '@/lib/supplier-reply-link'

export interface PortalLink {
  id: string
  tenant_id: string
  supplier_id: string
}

export interface ReplyLink {
  id: string
  tenant_id: string
  booking_id: string
  service_booking_id: string
}

export async function resolvePortalLink(db: SupabaseClient, token: string): Promise<PortalLink | null> {
  if (!isValidSupplierPageToken(token)) return null
  const { data, error } = await db
    .from('supplier_portal_links')
    .select('id, tenant_id, supplier_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new Error(`Could not read the supplier page link: ${error.message}`)
  return (data as PortalLink | null) ?? null
}

export async function resolveReplyLink(db: SupabaseClient, token: string, now: Date = new Date()): Promise<ReplyLink | null> {
  if (!isValidReplyToken(token)) return null
  const { data, error } = await db
    .from('service_booking_links')
    .select('id, tenant_id, booking_id, service_booking_id, revoked_at, expires_at')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new Error(`Could not read the reply link: ${error.message}`)
  if (!data || !isLinkLive(data, now)) return null
  return { id: data.id, tenant_id: data.tenant_id, booking_id: data.booking_id, service_booking_id: data.service_booking_id }
}
