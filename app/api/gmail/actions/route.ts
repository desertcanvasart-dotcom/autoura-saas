import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { refreshAccessToken } from '@/lib/gmail'
import { createAuthenticatedClient } from '@/lib/supabase-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export async function POST(request: NextRequest) {
  try {
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { userId, messageIds, action, labelId } = await request.json()

    if (!userId || !messageIds || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await supabase
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
        })
        .eq('user_id', userId)
    }

    oauth2Client.setCredentials({ access_token, refresh_token })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    const ids = Array.isArray(messageIds) ? messageIds : [messageIds]

    switch (action) {
      case 'delete':
        // Move to trash
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['TRASH'],
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'archive':
        // Remove from inbox
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'star':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['STARRED'],
          },
        })
        break

      case 'unstar':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['STARRED'],
          },
        })
        break

      case 'markRead':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['UNREAD'],
          },
        })
        break

      case 'markUnread':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['UNREAD'],
          },
        })
        break

      case 'move':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required for move action' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: [labelId],
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'addLabel':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: [labelId],
          },
        })
        break

      case 'removeLabel':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: [labelId],
          },
        })
        break

      case 'permanentDelete':
        // Permanently delete (use with caution)
        for (const id of ids) {
          await gmail.users.messages.delete({
            userId: 'me',
            id,
          })
        }
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Email action error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}