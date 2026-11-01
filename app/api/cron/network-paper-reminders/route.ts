import { bearerMatches } from '@/lib/support/probe-auth'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, adminDb } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { appRedirectBase } from '@/lib/oauth-config'
import { codeEmails } from '@/lib/supplier-accounts'
import { messageEmailHtml } from '@/lib/supplier-reply-link'
import { sendMail } from '@/lib/email-send'
import { reminderDue, reminderEmail, MAX_REMINDERS, type ReminderProfile } from '@/lib/supplier-network-reminders'

// ============================================
// Network suppliers who never sent their papers get an email
// ============================================
// Daily, from the reminders cron service (scripts/cron-reminders.mjs). Rules
// in lib/supplier-network-reminders. The email goes to the addresses on the
// supplier records of agencies that CONFIRMED them (approved sign-in claims)
// — the same addresses their sign-in code goes to, never one an unconfirmed
// agency typed.

const CRON_SECRET = process.env.CRON_SECRET

type Row = ReminderProfile & { account_id: string; display_name: string }

async function getHandler(request: NextRequest) {
  if (!bearerMatches(request.headers.get('authorization'), CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = adminDb()
  const now = new Date()

  const { data, error } = await db.from('supplier_network_profiles')
    .select('account_id, display_name, listed, verification_status, updated_at, papers_reminded_at, papers_reminder_count')
    .eq('listed', true).eq('verification_status', 'unverified').lt('papers_reminder_count', MAX_REMINDERS)
    .limit(500)
  if (error) return NextResponse.json({ success: false, error: `Could not read profiles: ${error.message}` }, { status: 500 })
  const due = ((data ?? []) as Row[]).filter(p => reminderDue(p, now))
  if (due.length === 0) return NextResponse.json({ success: true, reminded: 0, no_email: 0, failures: [] })

  const ids = due.map(p => p.account_id)
  const [{ data: papers, error: paperError }, { data: links, error: linkError }] = await Promise.all([
    db.from('supplier_network_documents').select('account_id').in('account_id', ids),
    db.from('supplier_account_links').select('account_id, supplier_id').in('account_id', ids).eq('status', 'approved'),
  ])
  if (paperError || linkError) {
    return NextResponse.json({ success: false, error: `Could not read papers or links: ${(paperError ?? linkError)!.message}` }, { status: 500 })
  }
  const supplierIds = [...new Set((links ?? []).map(l => l.supplier_id as string))]
  const { data: records, error: recordError } = supplierIds.length
    ? await db.from('suppliers').select('id, email, contact_email').in('id', supplierIds)
    : { data: [], error: null }
  if (recordError) return NextResponse.json({ success: false, error: `Could not read supplier records: ${recordError.message}` }, { status: 500 })

  const signInUrl = `${appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)}/supplier-login`
  let reminded = 0
  let noEmail = 0
  const failures: string[] = []
  for (const p of due) {
    const mine = new Set((links ?? []).filter(l => l.account_id === p.account_id).map(l => l.supplier_id as string))
    const emails = codeEmails((records ?? []).filter(r => mine.has(r.id as string)))
    if (emails.length === 0) { noEmail++; continue }
    const count = (papers ?? []).filter(d => d.account_id === p.account_id).length
    const mail = reminderEmail(p.display_name, count, signInUrl)
    let sent = 0
    for (const to of emails) {
      const r = await sendMail({ to, subject: mail.subject, html: messageEmailHtml(mail.text, { url: signInUrl, label: 'Sign in' }) })
      if (r.success) sent++
      else failures.push(`${p.account_id}: ${r.error ?? 'send failed'}`)
    }
    if (sent === 0) continue
    const { error: stampError } = await db.from('supplier_network_profiles')
      .update({ papers_reminded_at: now.toISOString(), papers_reminder_count: (p.papers_reminder_count ?? 0) + 1 })
      .eq('account_id', p.account_id)
    if (stampError) failures.push(`${p.account_id}: sent but not recorded: ${stampError.message}`)
    reminded++
  }

  return NextResponse.json({ success: failures.length === 0, reminded, no_email: noEmail, failures, message: `${reminded} supplier(s) reminded` })
}

export const GET = withJobRun('network-paper-reminders', () => createAdminClient(), getHandler)
