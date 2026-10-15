// ============================================
// Auto-link synced emails to the clients they belong to
// ============================================
// A client is "known" when their email address is on their record. Every
// synced message whose From (or, for outbound, To) matches one gets an
// email_client_links row, so the client page shows the email and the inbox
// shows the link — without anyone clicking Link to Client. Idempotent: a
// message already linked (by hand or by an earlier pass) is skipped.
//
// Built as PUT /api/email/links/auto long before anything called it; the
// email sync now runs it after every pass (2026-09-07).

import type { SupabaseClient } from '@supabase/supabase-js'
import { tenantClientEmails } from '@/lib/email/tenant-client-emails'

export interface SyncedEmailRef {
  messageId: string
  threadId?: string | null
  fromEmail?: string | null
  toEmails?: string[] | null
}

export interface AutoLinkResult {
  linked: number
  total: number
}

/** Match by address, case-insensitively; From first, then any To. */
export function matchEmailsToClients(
  emails: readonly SyncedEmailRef[],
  clients: readonly { id: string; email: string | null }[],
  alreadyLinked: ReadonlySet<string>
): Array<{ messageId: string; threadId: string | null; clientId: string; emailAddress: string | null }> {
  const byAddress = new Map<string, string>()
  for (const c of clients) if (c.email) byAddress.set(c.email.trim().toLowerCase(), c.id)
  const out: Array<{ messageId: string; threadId: string | null; clientId: string; emailAddress: string | null }> = []
  for (const e of emails) {
    if (!e.messageId || alreadyLinked.has(e.messageId)) continue
    let clientId = e.fromEmail ? byAddress.get(e.fromEmail.trim().toLowerCase()) : undefined
    if (!clientId && e.toEmails) {
      for (const to of e.toEmails) { clientId = byAddress.get(String(to).trim().toLowerCase()); if (clientId) break }
    }
    if (clientId) out.push({ messageId: e.messageId, threadId: e.threadId ?? null, clientId, emailAddress: e.fromEmail ?? null })
  }
  return out
}

/**
 * Link `emails` to the tenant's clients for `userId`'s mailbox. Uses a
 * service-role client (links are per mailbox, clients are per tenant), so
 * the tenant filter is the authorisation — pass the caller's own tenant.
 */
export async function autoLinkEmails(
  admin: SupabaseClient,
  tenantId: string,
  userId: string,
  emails: readonly SyncedEmailRef[]
): Promise<AutoLinkResult> {
  if (emails.length === 0) return { linked: 0, total: 0 }
  const clients = await tenantClientEmails(admin as unknown as Parameters<typeof tenantClientEmails>[0], tenantId)

  const { data: links } = await admin
    .from('email_client_links')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', emails.map(e => e.messageId))
  const already = new Set<string>((links ?? []).map((l: { message_id: string }) => l.message_id))

  const matches = matchEmailsToClients(emails, clients, already)
  if (matches.length === 0) return { linked: 0, total: emails.length }

  // Upsert, ignoring a link that already exists: a plain insert on the unique
  // (user_id, message_id) index failed the WHOLE batch when one link had been
  // made meanwhile (a manual link, an overlapping sync), and those messages
  // were never offered to auto-link again.
  const { data, error } = await admin
    .from('email_client_links')
    .upsert(matches.map(m => ({
      user_id: userId,
      message_id: m.messageId,
      thread_id: m.threadId,
      client_id: m.clientId,
      email_address: m.emailAddress,
      auto_linked: true,
    })), { onConflict: 'user_id,message_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  return { linked: data?.length ?? 0, total: emails.length }
}
