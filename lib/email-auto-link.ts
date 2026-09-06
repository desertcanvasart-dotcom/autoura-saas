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
  const { data: clients, error: clientError } = await admin
    .from('clients')
    .select('id, email')
    .eq('tenant_id', tenantId)
  if (clientError) throw clientError

  const { data: links } = await admin
    .from('email_client_links')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', emails.map(e => e.messageId))
  const already = new Set<string>((links ?? []).map((l: { message_id: string }) => l.message_id))

  const matches = matchEmailsToClients(emails, (clients ?? []) as { id: string; email: string | null }[], already)
  if (matches.length === 0) return { linked: 0, total: emails.length }

  const { data, error } = await admin
    .from('email_client_links')
    .insert(matches.map(m => ({
      user_id: userId,
      message_id: m.messageId,
      thread_id: m.threadId,
      client_id: m.clientId,
      email_address: m.emailAddress,
      auto_linked: true,
    })))
    .select('id')
  if (error) throw error
  return { linked: data?.length ?? 0, total: emails.length }
}
