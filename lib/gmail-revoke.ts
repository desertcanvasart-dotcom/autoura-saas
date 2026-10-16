// ============================================
// Disconnecting a mailbox: revoke at Google, then forget the tokens
// ============================================
// Deleting the row alone left the grant alive at Google: the refresh token
// still read and sent mail, and stayed listed under the user's Google
// "Third-party access". Used by Disconnect, by removing someone from a
// company, and by deleting an account.

import { createOAuthClient } from '@/lib/gmail'
import { openToken } from '@/lib/token-crypto'
import { createAdminClient } from '@/lib/supabase-server'

/**
 * Revoke and delete the Gmail connection(s) of `userId` — in one company, or
 * in every company when `tenantId` is null. Revocation is best-effort (an
 * already-revoked token is fine); the rows are always deleted.
 */
export async function revokeAndForgetMailbox(userId: string, tenantId: string | null): Promise<{ revoked: number; error: string | null }> {
  // The token columns are readable only by the service role (migration 273).
  const admin = createAdminClient()
  let q = admin.from('gmail_tokens').select('refresh_token, access_token').eq('user_id', userId)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data: rows, error: readError } = await q
  if (readError) return { revoked: 0, error: readError.message ?? String(readError) }

  let revoked = 0
  for (const row of (rows ?? []) as Array<{ refresh_token: string | null; access_token: string | null }>) {
    let token: string | null = null
    try {
      token = openToken(row.refresh_token) || openToken(row.access_token)
    } catch (err) {
      // Sealed under a key we no longer hold: it cannot be revoked, but the
      // row is still deleted below — an unreadable token must not keep an
      // account or a company from being deleted.
      console.warn('gmail-revoke: token could not be opened', err instanceof Error ? err.message : err)
    }
    if (!token) continue
    try {
      await Promise.race([
        createOAuthClient().revokeToken(token),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
      ])
      revoked++
    } catch (err) {
      // Already revoked or expired at Google: nothing left to revoke.
      console.warn('gmail-revoke: Google did not confirm the revoke', err instanceof Error ? err.message : err)
    }
  }

  let del = admin.from('gmail_tokens').delete().eq('user_id', userId)
  if (tenantId) del = del.eq('tenant_id', tenantId)
  const { error: deleteError } = await del
  return { revoked, error: deleteError ? (deleteError.message ?? String(deleteError)) : null }
}

/** Google refused the stored grant (revoked, expired, password changed). */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | null
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(String(e?.message ?? ''))
}
