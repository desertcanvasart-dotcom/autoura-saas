import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/super-admin'
import { reviewChange, reviewEmail, type ReviewDecision } from '@/lib/supplier-network-review'
import { recordsForPhone } from '@/lib/supplier-claims'
import { codeEmails } from '@/lib/supplier-accounts'
import { messageEmailHtml } from '@/lib/supplier-reply-link'
import { sendMail } from '@/lib/email-send'

// ============================================
// The Autoura team decides a network supplier (decision §7)
// ============================================
// POST { decision: 'verify' | 'reject' | 'revoke', note? } — super admins only.
// The supplier is told by email (the addresses on their supplier records —
// the same place their sign-in code goes).

export async function POST(request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const auth = await requireSuperAdmin()
  if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const db = auth.adminClient as unknown as SupabaseClient
  const { accountId } = await params
  const body = await request.json().catch(() => ({}))

  const { data: profile } = await db.from('supplier_network_profiles').select('display_name, verification_status').eq('account_id', accountId).maybeSingle()
  if (!profile) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  const change = reviewChange(profile.verification_status as string, body.decision, body.note)
  if (!change.ok) return NextResponse.json({ success: false, error: change.error }, { status: 409 })

  const now = new Date().toISOString()
  const { data: updated, error } = await db.from('supplier_network_profiles').update({
    verification_status: change.status,
    verification_note: change.note,
    verified_at: change.status === 'verified' ? now : null,
    verified_by: change.status === 'verified' ? auth.user!.id : null,
    updated_at: now,
  }).eq('account_id', accountId).eq('verification_status', profile.verification_status).select('verification_status').maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ success: false, error: 'Changed meanwhile — refresh and try again' }, { status: 409 })

  // Tell the supplier.
  const { data: account } = await db.from('supplier_accounts').select('phone').eq('id', accountId).maybeSingle()
  const emails = account?.phone ? codeEmails(await recordsForPhone(db, account.phone as string)) : []
  const mail = reviewEmail(body.decision as ReviewDecision, profile.display_name as string, change.note)
  for (const to of emails) {
    const sent = await sendMail({ to, subject: mail.subject, html: messageEmailHtml(mail.text) })
    if (!sent.success) console.error('[network review] email failed:', sent.error)
  }
  return NextResponse.json({ success: true, status: change.status, told: emails.length })
}
