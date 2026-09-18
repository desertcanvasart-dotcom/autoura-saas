import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { mailboxesToSync, type MailboxRow } from '@/lib/email/scheduled-sync'

// ============================================
// Mail arrives on its own
// ============================================
// Until now email only arrived when somebody opened the inbox and pressed
// sync. A customer who wrote on Friday evening sat unseen until Monday
// morning, and the reply-status work is worth nothing if the messages that
// start the clock only appear when someone goes looking.
//
// Every connected mailbox, every ten minutes. Each one is synced through the
// existing sync route with the server-to-server secret, so there is ONE sync
// implementation rather than a scheduled copy that can drift from the one
// people use by hand.

const CRON_SECRET = process.env.CRON_SECRET

/** A slow or broken mailbox must not hold up the rest of the sweep. */
const PER_MAILBOX_TIMEOUT_MS = 60_000

async function getHandler(request: NextRequest) {
  // Fail closed: with no secret configured, or a header that does not match,
  // this never runs.
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gmail_tokens')
    .select('user_id, tenant_id, email, access_token, refresh_token')

  if (error) {
    return NextResponse.json({ success: false, error: `Could not read the connected mailboxes: ${error.message}` }, { status: 500 })
  }

  const mailboxes = mailboxesToSync((data ?? []) as MailboxRow[])
  const origin = new URL(request.url).origin
  const results: Array<{ user_id: string; ok: boolean; messages?: number; error?: string }> = []

  for (const box of mailboxes) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_MAILBOX_TIMEOUT_MS)
    try {
      const res = await fetch(`${origin}/api/email/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({ user_id: box.user_id, full_sync: false, max_results: 50, days_back: 3 }),
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({}))
      results.push(
        res.ok && body.success
          ? { user_id: box.user_id, ok: true, messages: body.messages_created ?? 0 }
          : { user_id: box.user_id, ok: false, error: body.error || `HTTP ${res.status}` }
      )
    } catch (e) {
      // One mailbox's failure is recorded and the sweep carries on.
      results.push({ user_id: box.user_id, ok: false, error: e instanceof Error ? e.message : 'sync failed' })
    } finally {
      clearTimeout(timer)
    }
  }

  const failed = results.filter(r => !r.ok)
  return NextResponse.json({
    success: failed.length === 0,
    mailboxes: mailboxes.length,
    synced: results.length - failed.length,
    failed: failed.length,
    messages: results.reduce((n, r) => n + (r.messages ?? 0), 0),
    results,
  })
}

export const GET = withJobRun('gmail-sync', () => createAdminClient(), getHandler)
