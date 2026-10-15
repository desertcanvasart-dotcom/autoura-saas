// ============================================
// The signed-in person's Gmail, in the company being worked in
// ============================================
// Each /api/gmail/* route repeats the same steps: authenticate, find this
// person's mailbox for the CURRENT company (migration 415: one per person per
// company), refresh an expired token and save it, build a per-request client.
// The newer routes (drafts, threads, scheduled sends, rules) share this.

import { NextResponse } from 'next/server'
import type { gmail_v1 } from 'googleapis'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface MailboxTokens {
  access_token: string
  refresh_token: string
  token_expiry: string | null
  email?: string | null
}

/** A Gmail client for stored tokens, refreshing (and saving) an expired one. */
export async function gmailForTokens(
  db: Db,
  tokens: MailboxTokens,
  owner: { userId: string; tenantId: string },
): Promise<gmail_v1.Gmail> {
  let accessToken = tokens.access_token
  if (!tokens.token_expiry || new Date(tokens.token_expiry) <= new Date()) {
    const fresh = await refreshAccessToken(tokens.refresh_token)
    accessToken = fresh.access_token!
    await db
      .from('gmail_tokens')
      .update({
        access_token: fresh.access_token,
        token_expiry: new Date(fresh.expiry_date || Date.now() + 3600_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', owner.userId)
      .eq('tenant_id', owner.tenantId)
  }
  return getGmailClient(accessToken, tokens.refresh_token)
}

export type MailboxSession =
  | {
      ok: true
      gmail: gmail_v1.Gmail
      userId: string
      tenantId: string
      role: string | null
      /** The connected mailbox's own address. */
      mailboxEmail: string
      admin: ReturnType<typeof createAdminClient>
    }
  | { ok: false; response: NextResponse }

/**
 * The session's own mailbox. `requestedUserId`, when a caller sends one, must
 * be the session's own user — a person only ever acts in their own mailbox.
 */
export async function mailboxForSession(requestedUserId?: string | null): Promise<MailboxSession> {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return { ok: false, response: NextResponse.json({ success: false, error: auth.error }, { status: auth.status }) }
  }
  const userId = auth.user!.id
  if (requestedUserId && requestedUserId !== userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 }) }
  }
  const tenantId = auth.tenant_id
  if (!tenantId) {
    return { ok: false, response: NextResponse.json({ error: 'No active company' }, { status: 403 }) }
  }
  const admin = createAdminClient()
  const { data: tokens } = await (admin as unknown as Db)
    .from('gmail_tokens')
    .select('access_token, refresh_token, token_expiry, email')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!tokens) {
    return { ok: false, response: NextResponse.json({ error: 'Gmail not connected' }, { status: 401 }) }
  }
  const gmail = await gmailForTokens(admin as unknown as Db, tokens as MailboxTokens, { userId, tenantId })
  return {
    ok: true,
    gmail,
    userId,
    tenantId,
    role: auth.role ?? null,
    mailboxEmail: String((tokens as MailboxTokens).email ?? '').toLowerCase(),
    admin,
  }
}
