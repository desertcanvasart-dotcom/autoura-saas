import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { sendMail } from '@/lib/email-send'
import {
  CODE_SEND_WINDOW_MINUTES, canSendCode, codeEmails, codeExpiry, generateLoginCode, hashLoginCode, normalizeLoginPhone,
} from '@/lib/supplier-accounts'
import { recordsForPhone } from '@/lib/supplier-claims'
import { supplierSignInLimited } from '@/lib/supplier-rate-limits'

/**
 * Supplier sign-in, step 1 (Phase 2B): phone → a 6-digit code by email to the
 * addresses on that phone's supplier records. Public (middleware self-auth
 * prefix /api/supplier-auth/); the answer is the SAME whether or not the
 * phone is known, so nobody can probe which numbers are suppliers.
 */
const SAME_ANSWER = { success: true, message: 'If we work with this number, a code is on its way to the email we have for it.' }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = normalizeLoginPhone(body.phone)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    // Counted per address and per phone BEFORE the lookup, so every number —
    // a supplier's or not — reaches the same limit with the same answer (SN-3).
    const limited = await supplierSignInLimited(request, parsed.phone, 'code')
    if (limited) return limited
    const db = createAdminClient() as unknown as SupabaseClient

    const records = await recordsForPhone(db, parsed.phone)
    const emails = codeEmails(records)
    if (records.length === 0 || emails.length === 0) return NextResponse.json(SAME_ANSWER)

    // The account: one per phone, made on first sign-in.
    await db.from('supplier_accounts').upsert({ phone: parsed.phone, display_name: records[0].name }, { onConflict: 'phone', ignoreDuplicates: true })
    const { data: account } = await db.from('supplier_accounts').select('id, disabled_at').eq('phone', parsed.phone).maybeSingle()
    if (!account || account.disabled_at) return NextResponse.json(SAME_ANSWER)

    const now = new Date()
    const since = new Date(now.getTime() - CODE_SEND_WINDOW_MINUTES * 60_000).toISOString()
    const { data: recent } = await db.from('supplier_login_codes').select('created_at').eq('account_id', account.id).gte('created_at', since)
    // Over the per-account cap: send nothing, but answer as usual — a 429 only
    // a known number could reach would say the number is a supplier.
    if (!canSendCode((recent ?? []).map(r => r.created_at as string), now)) return NextResponse.json(SAME_ANSWER)

    const code = generateLoginCode()
    const { error: insertError } = await db.from('supplier_login_codes').insert({
      account_id: account.id, code_hash: hashLoginCode(code, account.id), channel: 'email', sent_to: emails.join(', '), expires_at: codeExpiry(now),
    })
    if (insertError) return NextResponse.json({ success: false, error: 'Could not send a code — please try again' }, { status: 500 })

    for (const to of emails) {
      const sent = await sendMail({
        to,
        subject: `Your Autoura sign-in code: ${code}`,
        html: `<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 15px; color: #111827;">
<p>Your sign-in code is</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
<p>It works for 10 minutes. If you did not ask for it, ignore this email.</p></div>`,
      })
      if (!sent.success) console.error('[supplier sign-in] code email failed:', sent.error)
    }
    return NextResponse.json(SAME_ANSWER)
  } catch (error) {
    console.error('[supplier sign-in] code:', error)
    return NextResponse.json({ success: false, error: 'Could not send a code — please try again' }, { status: 500 })
  }
}
