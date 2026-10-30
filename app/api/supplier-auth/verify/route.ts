import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import {
  SESSION_DAYS, checkLoginCode, generateSessionToken, hashSessionToken, normalizeLoginPhone, sessionExpiry,
} from '@/lib/supplier-accounts'
import { CLAIM_DECIDERS, claimRecords, recordsForPhone } from '@/lib/supplier-claims'
import { supplierCookie } from '@/lib/supplier-session'
import { notifyTeam } from '@/lib/notifications'

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
    const db = createAdminClient() as unknown as SupabaseClient
    const now = new Date()

    const { data: account } = await db.from('supplier_accounts').select('id, disabled_at').eq('phone', parsed.phone).maybeSingle()
    const { data: row } = account
      ? await db.from('supplier_login_codes').select('id, code_hash, expires_at, attempts, used_at')
        .eq('account_id', account.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null }
    const check = checkLoginCode(account && !account.disabled_at ? row : null, body.code, account?.id ?? '', now)
    if (!check.ok) {
      if (check.spend && row) await db.from('supplier_login_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

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
