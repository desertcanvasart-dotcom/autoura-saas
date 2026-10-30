// ============================================
// The signed-in supplier (Phase 2B, migration 450) — server only
// ============================================
// Reads the supplier session cookie, checks it against supplier_sessions (by
// hash) with the service role, and returns the account. Suppliers are never
// tenant users: nothing here touches Supabase auth.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SESSION_COOKIE, hashSessionToken, isSessionLive } from '@/lib/supplier-accounts'

export interface SupplierAccount { id: string; phone: string; display_name: string | null }

export async function supplierFromToken(db: SupabaseClient, token: string | undefined | null): Promise<{ account: SupplierAccount; sessionId: string } | null> {
  if (!token || token.length < 32 || token.length > 128) return null
  const { data: session } = await db.from('supplier_sessions')
    .select('id, account_id, expires_at, revoked_at').eq('token_hash', hashSessionToken(token)).maybeSingle()
  if (!session || !isSessionLive(session, new Date())) return null
  const { data: account } = await db.from('supplier_accounts')
    .select('id, phone, display_name, disabled_at').eq('id', session.account_id).maybeSingle()
  if (!account || account.disabled_at) return null
  void db.from('supplier_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)
    .then(({ error }) => { if (error) console.error('[supplier session] seen:', error.message) })
  return { account: { id: account.id, phone: account.phone, display_name: account.display_name }, sessionId: session.id }
}

export const supplierCookie = (token: string, maxAgeSeconds: number) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
})
