import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase-server'
import { withJobRun } from '@/lib/support/job-runs'
import { notifyNewEmails } from '@/lib/email/new-mail-alerts'

// ============================================
// New mail is announced while Autoura is closed
// ============================================
// Operator, 2026-09-24: people are not at their computer all day, so a new
// email must reach their phone or desktop as an alert. The in-app check only
// runs while a tab is open; this runs on the server every 5 minutes (Railway's
// shortest cron) for every connected Gmail, and files the same bell item —
// which rings the owner's devices (lib/notifications notifyUserOnce → push).
// Each email is announced once however many checks see it (migration 384).
//
// Light on purpose: one Gmail list call per mailbox when nothing is new. The
// full mail sync (/api/cron/gmail-sync) stays its own, heavier job.

const CRON_SECRET = process.env.CRON_SECRET

async function getHandler(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await createAdminClient()
    .from('gmail_tokens')
    .select('user_id, email, access_token, refresh_token')
  if (error) {
    return NextResponse.json({ success: false, error: `Could not read the connected mailboxes: ${error.message}` }, { status: 500 })
  }

  const results: Array<{ email: string | null; ok: boolean; error?: string }> = []
  for (const box of data ?? []) {
    if (!box.user_id || !box.refresh_token) {
      results.push({ email: box.email, ok: false, error: 'no owner or no refresh token — reconnect Gmail' })
      continue
    }
    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      )
      // An expired access token is refreshed by the client on first call.
      auth.setCredentials({ access_token: box.access_token, refresh_token: box.refresh_token })
      await notifyNewEmails(google.gmail({ version: 'v1', auth }), box.user_id)
      results.push({ email: box.email, ok: true })
    } catch (e) {
      // One mailbox's failure (revoked access, Gmail hiccup) is recorded and
      // the sweep carries on.
      results.push({ email: box.email, ok: false, error: e instanceof Error ? e.message : 'check failed' })
    }
  }

  const failed = results.filter(r => !r.ok)
  return NextResponse.json({
    success: failed.length === 0,
    mailboxes: results.length,
    checked: results.length - failed.length,
    failed: failed.length,
    results,
  })
}

export const GET = withJobRun('mail-alerts', () => createAdminClient(), getHandler)
