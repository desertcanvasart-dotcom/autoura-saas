import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { gmailForTokens, type MailboxTokens } from '@/lib/gmail-mailbox'
import { MAX_PER_RUN, STALE_CLAIM_MS, outcomeOfError } from '@/lib/email/scheduled-send'

// ============================================
// Schedule send — the job that sends what is due
// ============================================
// Every 5 minutes (Railway's shortest schedule): each scheduled email whose
// time has come is CLAIMED (pending → sending, so two overlapping runs never
// both send it) and its Gmail draft is sent with users.drafts.send. Gmail
// removes the draft as it sends, exactly as pressing Send on it would.
//
// A claim older than STALE_CLAIM_MS means a run died mid-send. It is never
// retried: Gmail may already have sent it, and a second copy to a client is
// worse than asking the person to check Sent.

const CRON_SECRET = process.env.CRON_SECRET

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

interface DueRow {
  id: string
  tenant_id: string
  user_id: string
  gmail_draft_id: string
  attempts: number
}

async function getHandler(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient() as unknown as Db
  const now = new Date()

  // 1. Interrupted sends: reported, not repeated.
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()
  const { data: interrupted } = await db
    .from('scheduled_emails')
    .update({
      status: 'failed',
      error: 'Sending was interrupted. Check Sent before sending it again — it may already have gone.',
      updated_at: now.toISOString(),
    })
    .eq('status', 'sending')
    .lt('claimed_at', stale)
    .select('id')

  // 2. What is due.
  const { data: due, error } = await db
    .from('scheduled_emails')
    .select('id, tenant_id, user_id, gmail_draft_id, attempts')
    .eq('status', 'pending')
    .lte('send_at', now.toISOString())
    .order('send_at', { ascending: true })
    .limit(MAX_PER_RUN)
  if (error) {
    return NextResponse.json({ success: false, error: `Could not read scheduled emails: ${error.message}` }, { status: 500 })
  }

  const results: Array<{ id: string; status: string; error?: string }> = []
  for (const row of (due ?? []) as DueRow[]) {
    // Claim it: only one run moves it out of pending.
    const attempts = (row.attempts ?? 0) + 1
    const { data: claimed } = await db
      .from('scheduled_emails')
      .update({ status: 'sending', claimed_at: new Date().toISOString(), attempts, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    let patch: Record<string, unknown>
    try {
      const { data: tokens } = await db
        .from('gmail_tokens')
        .select('access_token, refresh_token, token_expiry, email')
        .eq('user_id', row.user_id)
        .eq('tenant_id', row.tenant_id)
        .maybeSingle()
      if (!tokens?.refresh_token) {
        patch = { status: 'failed', error: 'Gmail is no longer connected for this mailbox — reconnect it, then send the draft.' }
      } else {
        const gmail = await gmailForTokens(db, tokens as MailboxTokens, { userId: row.user_id, tenantId: row.tenant_id })
        const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: row.gmail_draft_id } })
        patch = { status: 'sent', sent_at: new Date().toISOString(), gmail_message_id: data.id ?? null, error: null }
      }
    } catch (err) {
      const outcome = outcomeOfError(err, attempts)
      patch = outcome.status === 'sent' ? { status: 'sent' } : { status: outcome.status, error: outcome.error }
    }
    await db.from('scheduled_emails').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', row.id)
    results.push({ id: row.id, status: String(patch.status), ...(patch.error ? { error: String(patch.error) } : {}) })
  }

  const failed = results.filter(r => r.status === 'failed')
  return NextResponse.json({
    success: failed.length === 0,
    due: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    retrying: results.filter(r => r.status === 'pending').length,
    failed: failed.length,
    interrupted: interrupted?.length ?? 0,
    results,
  })
}

export const GET = withJobRun('scheduled-send', () => createAdminClient(), getHandler)
