// ============================================
// Which CRM client a Pricing Grid save belongs to
// ============================================
// The grid is where an email or WhatsApp request becomes a priced trip, so a
// save must land on the right CRM client — otherwise the itinerary and quote
// float free of the person who asked, and the Lead → Customer promotion
// (migration 352, on booking) never reaches them.
//
// Order, all within the tenant:
//   1. the client the grid was opened for (inbox hand-off, itinerary load)
//   2. an existing client with the same email (case-insensitive)
//   3. an existing client with the same phone (with or without a leading +)
//   4. a new LEAD, when there is a name and a way to reach them
// No name and no match → null: the trip is still saved, just unlinked.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CLIENT_STAGE } from '@/lib/client-stage'

export type GridClientSource = 'email' | 'whatsapp'

export interface GridClientIdentity {
  clientId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  /** Where the request came in; stamped on a newly created client. */
  source?: GridClientSource | null
  /** Creating a Lead is for direct (B2C) travellers only. */
  allowCreate: boolean
}

export interface GridClientLink {
  clientId: string | null
  how: 'given' | 'email' | 'phone' | 'created' | 'none'
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

/** ILIKE treats _ and % as wildcards — common in email addresses. */
export function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, m => `\\${m}`)
}

/** The two spellings a phone is stored under: with and without the leading +. */
export function phoneVariants(phone: string): string[] {
  const p = phone.replace(/[\s\-().]/g, '')
  if (!p) return []
  const bare = p.replace(/^\+/, '')
  return Array.from(new Set([p, bare, `+${bare}`]))
}

export function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]
  return { first_name: first, last_name: parts.slice(1).join(' ') || first }
}

export async function resolveGridClient(
  supabase: SupabaseClient,
  tenantId: string,
  who: GridClientIdentity,
): Promise<GridClientLink> {
  const givenId = clean(who.clientId)
  if (givenId) {
    const { data } = await supabase
      .from('clients').select('id')
      .eq('tenant_id', tenantId).eq('id', givenId)
      .maybeSingle()
    if (data?.id) return { clientId: data.id, how: 'given' }
    // A stale or foreign id is ignored, never written — fall through to match.
  }

  const email = clean(who.email)
  if (email) {
    const { data } = await supabase
      .from('clients').select('id')
      .eq('tenant_id', tenantId).ilike('email', escapeLike(email))
      .limit(1).maybeSingle()
    if (data?.id) return { clientId: data.id, how: 'email' }
  }

  const phones = phoneVariants(clean(who.phone))
  if (phones.length) {
    const { data } = await supabase
      .from('clients').select('id')
      .eq('tenant_id', tenantId).in('phone', phones)
      .limit(1).maybeSingle()
    if (data?.id) return { clientId: data.id, how: 'phone' }
  }

  const name = clean(who.name)
  if (!who.allowCreate || !name || (!email && !phones.length)) {
    return { clientId: null, how: 'none' }
  }

  const { first_name, last_name } = splitName(name)
  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      tenant_id: tenantId,
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`.trim(),
      email: email || null,
      phone: clean(who.phone) || null,
      nationality: 'Unknown',
      status: DEFAULT_CLIENT_STAGE,
      client_type: 'individual',
      passport_type: 'other',
      preferred_language: 'English',
      client_source: who.source || 'direct',
      vip_status: false,
    })
    .select('id')
    .single()
  if (error || !created) {
    console.error('[grid-client-link] client insert failed:', error?.message)
    return { clientId: null, how: 'none' }
  }

  // A WhatsApp chat with this number now belongs to the new client too.
  if (who.source === 'whatsapp' && phones.length) {
    const { error: linkErr } = await supabase
      .from('whatsapp_conversations')
      .update({ client_id: created.id, client_name: name })
      .eq('tenant_id', tenantId).in('phone_number', phones).is('client_id', null)
    if (linkErr) console.warn('[grid-client-link] WhatsApp link failed:', linkErr.message)
  }

  return { clientId: created.id, how: 'created' }
}
