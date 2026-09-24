import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { planMailboxSweep, lookBackDays, type MailboxRow, type MembershipRow } from '@/lib/email/scheduled-sync'
import { POST as syncMailbox } from '@/app/api/email/sync/route'

// ============================================
// Mail arrives on its own
// ============================================
// Until now email only arrived when somebody opened the inbox and pressed
// sync. A customer who wrote on Friday evening sat unseen until Monday
// morning, and the reply-status work is worth nothing if the messages that
// start the clock only appear when someone goes looking.
//
// Every connected mailbox, every ten minutes. Each one is synced by the
// existing sync route's own handler with the server-to-server secret, so
// there is ONE sync implementation rather than a scheduled copy that can
// drift from the one people use by hand.

const CRON_SECRET = process.env.CRON_SECRET

/** A slow or broken mailbox must not hold up the rest of the sweep. */
const PER_MAILBOX_TIMEOUT_MS = 60_000

/** How far back a run looks. Ten minutes of mail normally — but the sweep can
 *  be off for weeks (it was: nothing was stored between 6 and 20 September
 *  2026), and a fixed 3 days would then skip everything in between for good.
 *  So it reaches back to the newest email this company already has. */
async function daysToLookBack(admin: ReturnType<typeof createAdminClient>, tenantId: string): Promise<number> {
  const { data } = await admin
    .from('unified_messages')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('channel', 'email')
    .order('created_at', { ascending: false })
    .limit(1)
  const newest = (data as Array<{ created_at?: string | null }> | null)?.[0]?.created_at
  return lookBackDays(newest ?? null, new Date())
}

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

  // The company comes from the owner's membership when the mailbox row does
  // not carry one — and on production none of them did (see scheduled-sync).
  const rows = (data ?? []) as MailboxRow[]
  const ownerIds = [...new Set(rows.map(r => r.user_id).filter((v): v is string => Boolean(v)))]
  const { data: memberRows, error: memberError } = ownerIds.length
    ? await admin.from('tenant_members').select('user_id, tenant_id, joined_at').in('user_id', ownerIds)
    : { data: [], error: null }
  if (memberError) {
    return NextResponse.json({ success: false, error: `Could not read who owns the mailboxes: ${memberError.message}` }, { status: 500 })
  }
  const { mailboxes, skipped } = planMailboxSweep(rows, (memberRows ?? []) as MembershipRow[])
  const results: Array<{ user_id: string; ok: boolean; messages?: number; error?: string }> = []

  for (const box of mailboxes) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_MAILBOX_TIMEOUT_MS)
    try {
      // The sync route's own handler, called in-process with the server
      // secret: still ONE sync implementation, and no HTTP hop. The hop
      // failed twice on the first live runs (2026-09-24): the proxy's origin
      // did not connect back, and over loopback the session gate in
      // middleware.ts refused the call before the route's secret check ran.
      const res = await Promise.race([
        syncMailbox(new NextRequest('http://internal/api/email/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
          body: JSON.stringify({ user_id: box.user_id, full_sync: false, max_results: 50, days_back: await daysToLookBack(admin, box.tenant_id) }),
        })),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error(`timed out after ${PER_MAILBOX_TIMEOUT_MS / 1000}s`)))),
      ])
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
  // Connected mailboxes and not one of them syncable is a failure, not a quiet
  // night: that is exactly how this sweep would have reported "success" while
  // pulling nothing.
  const nothingSyncable = rows.length > 0 && mailboxes.length === 0
  return NextResponse.json({
    success: failed.length === 0 && !nothingSyncable,
    ...(nothingSyncable ? { error: `None of the ${rows.length} connected mailbox(es) could be synced — see "skipped".` } : {}),
    skipped,
    mailboxes: mailboxes.length,
    synced: results.length - failed.length,
    failed: failed.length,
    messages: results.reduce((n, r) => n + (r.messages ?? 0), 0),
    results,
  })
}

export const GET = withJobRun('gmail-sync', () => createAdminClient(), getHandler)
