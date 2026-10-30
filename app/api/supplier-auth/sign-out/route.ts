import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE, hashSessionToken } from '@/lib/supplier-accounts'
import { supplierCookie } from '@/lib/supplier-session'

/** Sign the supplier out: the session is revoked and the cookie cleared. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    const db = createAdminClient() as unknown as SupabaseClient
    const { error } = await db.from('supplier_sessions').update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', hashSessionToken(token)).is('revoked_at', null)
    if (error) console.error('[supplier sign-out]', error.message)
  }
  const res = NextResponse.json({ success: true })
  res.cookies.set(supplierCookie('', 0))
  return res
}
