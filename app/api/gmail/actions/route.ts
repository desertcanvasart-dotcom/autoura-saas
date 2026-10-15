import { NextRequest, NextResponse } from 'next/server'
import { labelChange, MAX_ACTION_IDS } from '@/lib/email/mail-actions'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// One Gmail client per request (lib/gmail getGmailClient). A module-level
// OAuth2 client used to be shared by every request: setCredentials() for user
// A, then user B's request set B's tokens before A's Gmail call ran, so A
// could act in — or send from — B's mailbox (documents audit, round 12).

export async function POST(request: NextRequest) {
  try {
    // Authenticate user first (session + active tenant membership)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const user = authResult.user!
    // The mailbox of the company being worked in (migration 415: one per
    // person per company).
    const mailboxTenant = authResult.tenant_id!
    const supabase = createAdminClient()

    const { userId, messageIds, action, labelId } = await request.json()

    if (!userId || !messageIds || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await (supabase as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', mailboxTenant)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await (supabase as any)
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', mailboxTenant)
    }

    const gmail = getGmailClient(access_token, refresh_token)

    const ids: string[] = (Array.isArray(messageIds) ? messageIds : [messageIds]).map(String).filter(Boolean)
    // "Select all" across pages acts on up to MAX_ACTION_IDS at once; Gmail
    // takes 1,000 per batch call, so the work is chunked.
    if (ids.length > MAX_ACTION_IDS) {
      return NextResponse.json({ error: `At most ${MAX_ACTION_IDS.toLocaleString()} emails at a time` }, { status: 400 })
    }

    const change = labelChange(action, labelId)
    if ('error' in change) {
      return NextResponse.json({ error: change.error }, { status: 400 })
    }

    switch (action) {
      case 'permanentDelete':
        // messages.delete needs the full https://mail.google.com/ scope, which
        // GMAIL_SCOPES (lib/gmail.ts) does not request — Google answered 403
        // and this route a bare 500, every time. Nothing in the app calls it;
        // say so plainly rather than fail obscurely. 'delete' moves to Trash,
        // which Gmail empties after 30 days.
        return NextResponse.json(
          { error: 'Permanent delete is not available. Use delete, which moves mail to Trash.' },
          { status: 400 }
        )

      default:
        for (let i = 0; i < ids.length; i += 1000) {
          await gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: { ids: ids.slice(i, i + 1000), ...change },
          })
        }
    }

    // Mail you have read, archived or deleted is no longer news: its bell
    // notification (gmail:<id>, see /api/gmail/poll) goes read too.
    if (['markRead', 'archive', 'delete', 'move', 'spam'].includes(action)) {
      const { error: notifError } = await createAdminClient()
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .in('dedupe_key', ids.map((id: string) => `gmail:${id}`))
      if (notifError) console.error('clearing new-email notifications failed:', notifError.message)
    }

    return NextResponse.json({ success: true, count: ids.length })
  } catch (err: any) {
    console.error('Email action error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}