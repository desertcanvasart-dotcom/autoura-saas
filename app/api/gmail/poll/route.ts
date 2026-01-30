import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from '@/lib/supabase-server'

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

    // Get user's Gmail tokens
    const { data: tokenData, error: tokenError } = await getSupabase()
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

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
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })

    // Check if token needs refresh
    if (new Date(tokenData.token_expiry) < new Date()) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      
      await getSupabase()
        .from('gmail_tokens')
        .update({
          access_token: credentials.access_token,
          token_expiry: new Date(credentials.expiry_date!).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

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

    // Get history since last check
    try {
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      })

      if (!history.data.history) {
        return NextResponse.json({
          historyId: history.data.historyId || historyId,
          hasChanges: false,
          newMessages: [],
          deletedMessages: [],
          labelChanges: [],
        })
      }

      const newMessageIds: string[] = []
      const deletedMessageIds: string[] = []
      const labelChanges: Array<{
        messageId: string
        labelsAdded?: string[]
        labelsRemoved?: string[]
      }> = []

      for (const item of history.data.history) {
        // New messages
        if (item.messagesAdded) {
          for (const msg of item.messagesAdded) {
            if (msg.message?.id) {
              newMessageIds.push(msg.message.id)
            }
          }
        }

        // Deleted messages
        if (item.messagesDeleted) {
          for (const msg of item.messagesDeleted) {
            if (msg.message?.id) {
              deletedMessageIds.push(msg.message.id)
            }
          }
        }

        // Label changes
        if (item.labelsAdded || item.labelsRemoved) {
          const messageId = item.labelsAdded?.[0]?.message?.id || 
                           item.labelsRemoved?.[0]?.message?.id

          if (messageId) {
            labelChanges.push({
              messageId,
              labelsAdded: item.labelsAdded?.map(l => l.labelIds || []).flat(),
              labelsRemoved: item.labelsRemoved?.map(l => l.labelIds || []).flat(),
            })
          }
        }
      }

      // Fetch details for new messages
      const newMessages = []
      for (const messageId of newMessageIds.slice(0, 10)) { // Limit to 10
        try {
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          })

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
        historyId: history.data.historyId,
        hasChanges: newMessages.length > 0 || deletedMessageIds.length > 0 || labelChanges.length > 0,
        newMessages,
        deletedMessages: deletedMessageIds,
        labelChanges,
        totalNew: newMessageIds.length,
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
    console.error('Error polling emails:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/gmail/poll
// Get unread count
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

    // Get user's Gmail tokens
    const { data: tokenData, error: tokenError } = await getSupabase()
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

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
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get unread count
    const unreadList = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox is:unread',
      maxResults: 1,
    })

    // Get total inbox count (for pagination info)
    const inboxList = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox',
      maxResults: 1,
    })

    return NextResponse.json({
      unreadCount: unreadList.data.resultSizeEstimate || 0,
      totalInbox: inboxList.data.resultSizeEstimate || 0,
    })

  } catch (error: any) {
    console.error('Error getting email counts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
