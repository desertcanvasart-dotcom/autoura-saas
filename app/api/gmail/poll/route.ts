import { gmailReconnectResponse } from '@/lib/gmail-reconnect'
import { sealToken, openToken } from '@/lib/token-crypto'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { notifyNewEmails } from '@/lib/email/new-mail-alerts'
import { currentTenantId, type MembershipDb } from '@/lib/current-membership'
import {
  collectHistoryChanges,
  isInboxArrival,
  MAX_HISTORY_PAGES,
  MAX_NEW_FETCH,
  type HistoryRecord,
} from '@/lib/email/poll-history'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

// GET /api/gmail/poll?userId=xxx&historyId=xxx
// Poll for new emails since last history ID
export async function GET(request: NextRequest) {
  try {
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const historyId = searchParams.get('historyId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    // The mailbox of the company being worked in (migration 415).
    const { tenantId: mailboxTenant } = await currentTenantId(authClient as unknown as MembershipDb)
    if (!mailboxTenant) {
      return NextResponse.json({ error: 'No active company' }, { status: 403 })
    }

    // Get user's Gmail tokens
    const { data: tokenData, error: tokenError } = await (getSupabase() as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', mailboxTenant)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      access_token: openToken(tokenData.access_token),
      refresh_token: openToken(tokenData.refresh_token),
    })

    // Check if token needs refresh
    if (new Date(tokenData.token_expiry) < new Date()) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      
      await (getSupabase() as any)
        .from('gmail_tokens')
        .update({
          access_token: sealToken(credentials.access_token),
          token_expiry: new Date(credentials.expiry_date!).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('tenant_id', mailboxTenant)

      oauth2Client.setCredentials(credentials)
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // If no historyId, get the current one
    if (!historyId) {
      const profile = await gmail.users.getProfile({ userId: 'me' })
      return NextResponse.json({
        historyId: profile.data.historyId,
        hasChanges: false,
        newMessages: [],
        deletedMessages: [],
        labelChanges: [],
      })
    }

    // Get history since last check — every page of it. Advancing historyId
    // past an unread page loses those changes for good (lib/email/poll-history).
    try {
      const records: HistoryRecord[] = []
      let latestHistoryId: string | null | undefined
      let pageToken: string | undefined
      let pages = 0
      do {
        const history = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: historyId,
          historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
          ...(pageToken ? { pageToken } : {}),
        })
        records.push(...(history.data.history ?? []))
        latestHistoryId = history.data.historyId || latestHistoryId
        pageToken = history.data.nextPageToken || undefined
        pages++
      } while (pageToken && pages < MAX_HISTORY_PAGES)

      // More change than one poll should replay: reload the list instead.
      if (pageToken) {
        const profile = await gmail.users.getProfile({ userId: 'me' })
        return NextResponse.json({
          historyId: profile.data.historyId,
          hasChanges: true,
          newMessages: [],
          deletedMessages: [],
          labelChanges: [],
          needsFullRefresh: true,
        })
      }

      const { newMessageIds, deletedMessageIds, labelChanges } = collectHistoryChanges(records)
      const nextHistoryId = latestHistoryId || historyId

      // More arrivals than are worth fetching one by one: the inbox reloads,
      // which shows them all, rather than showing ten and dropping the rest.
      if (newMessageIds.length > MAX_NEW_FETCH) {
        return NextResponse.json({
          historyId: nextHistoryId,
          hasChanges: true,
          newMessages: [],
          deletedMessages: deletedMessageIds,
          labelChanges,
          needsFullRefresh: true,
          totalNew: newMessageIds.length,
        })
      }

      // Fetch details for new messages
      const newMessages = []
      for (const messageId of newMessageIds) {
        try {
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          })

          // History may not carry labels; the message itself always does.
          // A sent reply or a draft is not new mail in the Inbox.
          if (!isInboxArrival(message.data.labelIds ?? [])) continue

          const headers = message.data.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

          newMessages.push({
            id: message.data.id,
            threadId: message.data.threadId,
            snippet: message.data.snippet,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            labelIds: message.data.labelIds,
            isUnread: message.data.labelIds?.includes('UNREAD'),
          })
        } catch (e) {
          // Message might have been deleted
          console.error('Error fetching message:', messageId, e)
        }
      }

      return NextResponse.json({
        historyId: nextHistoryId,
        hasChanges: newMessages.length > 0 || deletedMessageIds.length > 0 || labelChanges.length > 0,
        newMessages,
        deletedMessages: deletedMessageIds,
        labelChanges,
        totalNew: newMessages.length,
      })

    } catch (error: any) {
      // History ID might be too old
      if (error.code === 404) {
        // Get fresh history ID
        const profile = await gmail.users.getProfile({ userId: 'me' })
        return NextResponse.json({
          historyId: profile.data.historyId,
          hasChanges: true, // Force refresh
          newMessages: [],
          deletedMessages: [],
          labelChanges: [],
          needsFullRefresh: true,
        })
      }
      throw error
    }

  } catch (error: any) {
    const reconnect = gmailReconnectResponse(error)
    if (reconnect) return reconnect
    console.error('Error polling emails:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/gmail/poll
// Unread count of the Primary inbox (the sidebar badge)
export async function POST(request: NextRequest) {
  try {
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    // The mailbox of the company being worked in (migration 415).
    const { tenantId: mailboxTenant } = await currentTenantId(authClient as unknown as MembershipDb)
    if (!mailboxTenant) {
      return NextResponse.json({ error: 'No active company' }, { status: 403 })
    }

    // Get user's Gmail tokens
    const { data: tokenData, error: tokenError } = await (getSupabase() as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', mailboxTenant)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      access_token: openToken(tokenData.access_token),
      refresh_token: openToken(tokenData.refresh_token),
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Unread mail in the Primary tab only — Promotions, Social, Updates and
    // Forums don't count, so the badge means "someone wrote to you".
    // Gmail tags Primary as CATEGORY_PERSONAL; labelIds filters are ANDed.
    // Counted from the ids themselves (exact), not resultSizeEstimate (a
    // guess). One page of 100 is enough: the badge shows 99+ beyond that.
    const unread = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX', 'CATEGORY_PERSONAL', 'UNREAD'],
      maxResults: 100,
      fields: 'messages/id,nextPageToken',
    })
    const onPage = unread.data.messages?.length || 0

    // The bell: one notification per new Primary email. Best-effort — a
    // failure here must never cost the badge its count.
    try {
      await notifyNewEmails(gmail, user.id)
    } catch (e) {
      console.error('new-email notifications failed (count unaffected):', (e as Error).message)
    }

    return NextResponse.json({
      unreadCount: unread.data.nextPageToken ? Math.max(onPage, 100) : onPage,
    })

  } catch (error: any) {
    const reconnect = gmailReconnectResponse(error)
    if (reconnect) return reconnect
    console.error('Error getting email counts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
