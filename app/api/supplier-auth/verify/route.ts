import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import {
  SESSION_DAYS, canTryCode, checkLoginCode, generateSessionToken, hashSessionToken, normalizeLoginPhone, sessionExpiry,
} from '@/lib/supplier-accounts'
import { CLAIM_DECIDERS, claimRecords, recordsForPhone } from '@/lib/supplier-claims'
import { supplierCookie } from '@/lib/supplier-session'
import { notifyTeam } from '@/lib/notifications'
import { supplierSignInLimited } from '@/lib/supplier-rate-limits'

/**
 * Supplier sign-in, step 2 (Phase 2B): phone + code → a session cookie.
 * Each wrong try counts (5 per code). On success the code is spent, and every
 * agency record with this phone gets a pending claim for its admin to approve.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = normalizeLoginPhone(body.phone)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    // Per address and per phone, before the lookup (audit SN-2/SN-3).
    const limited = await supplierSignInLimited(request, parsed.phone, 'verify')
    if (limited) return limited
    const db = createAdminClient() as unknown as SupabaseClient
    const now = new Date()

    const { data: account } = await db.from('supplier_accounts').select('id, disabled_at').eq('phone', parsed.phone).maybeSingle()
    const { data: row } = account
      ? await db.from('supplier_login_codes').select('id, code_hash, expires_at, attempts, used_at')
        .eq('account_id', account.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null }
    const live = account && !account.disabled_at ? row : null
    const allowed = canTryCode(live, body.code, now)
    if (!allowed.ok) return NextResponse.json({ success: false, error: allowed.error }, { status: 400 })

    // Take the try BEFORE comparing: the count moves only from the value we
    // read, so of several guesses sent at once just one gets each try and the
    // rest are turned away uncompared — the 5-try cap holds under a race.
    const { data: taken } = await db.from('supplier_login_codes').update({ attempts: live!.attempts + 1 })
      .eq('id', live!.id).eq('attempts', live!.attempts).is('used_at', null).select('id')
    if (!taken || taken.length === 0) {
      return NextResponse.json({ success: false, error: 'Too many tries at once — wait a moment and try again' }, { status: 429 })
    }
    const check = checkLoginCode(live, body.code, account!.id, now)
    if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: 400 })

    // Spend the code once, even if two requests race.
    const { data: spent } = await db.from('supplier_login_codes').update({ used_at: now.toISOString() }).eq('id', row!.id).is('used_at', null).select('id')
    if (!spent || spent.length === 0) return NextResponse.json({ success: false, error: 'Ask for a new code' }, { status: 400 })

    const token = generateSessionToken()
    const { error } = await db.from('supplier_sessions').insert({
      account_id: account!.id, token_hash: hashSessionToken(token), expires_at: sessionExpiry(now),
    })
    if (error) return NextResponse.json({ success: false, error: 'Could not sign you in — please try again' }, { status: 500 })
    await db.from('supplier_accounts').update({ last_login_at: now.toISOString() }).eq('id', account!.id)
    const records = await recordsForPhone(db, parsed.phone)
    const fresh = await claimRecords(db, account!.id, records)
    // Each agency's owners and admins are asked to confirm it is them (§9).
    for (const claim of fresh) {
      const name = records.find(r => r.id === claim.supplier_id)?.name ?? 'A supplier'
      void notifyTeam({
        tenant_id: claim.tenant_id,
        roles: CLAIM_DECIDERS,
        dedupe_key: `supplier-claim:${claim.id}`,
        type: 'supplier',
        title: `${name} wants to sign in as your supplier`,
        message: `From +${parsed.phone}. Confirm it is them on the Suppliers page.`,
        link: '/suppliers',
      }).catch(e => console.error('[supplier sign-in] notify:', e))
    }

    const res = NextResponse.json({ success: true })
    res.cookies.set(supplierCookie(token, SESSION_DAYS * 86_400))
    return res
  } catch (error) {
    console.error('[supplier sign-in] verify:', error)
    return NextResponse.json({ success: false, error: 'Could not sign you in — please try again' }, { status: 500 })
  }
}
