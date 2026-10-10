import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// One Gmail client per request (lib/gmail getGmailClient). A module-level
// OAuth2 client used to be shared by every request: setCredentials() for user
// A, then user B's request set B's tokens before A's Gmail call ran, so A
// could act in — or send from — B's mailbox (documents audit, round 12).

// GET - Fetch all labels
export async function GET(request: NextRequest) {
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
    const supabase = createAdminClient()

    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await (supabase as any)
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

      await (supabase as any)
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
        })
        .eq('user_id', userId)
    }

    const gmail = getGmailClient(access_token, refresh_token)

    const response = await gmail.users.labels.list({ userId: 'me' })
    
    // Filter to show only user-created labels and some system labels
    const labels = response.data.labels?.filter(label => 
      label.type === 'user' || 
      ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT'].includes(label.id || '')
    ) || []

    return NextResponse.json({ labels })
  } catch (err: any) {
    console.error('Get labels error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST - Create new label
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
    const supabase = createAdminClient()

    const { userId, name, backgroundColor, textColor } = await request.json()

    if (!userId || !name) {
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
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!
    }

    const gmail = getGmailClient(access_token, refresh_token)

    const response = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        color: backgroundColor && textColor ? {
          backgroundColor,
          textColor,
        } : undefined,
      },
    })

    return NextResponse.json({ label: response.data })
  } catch (err: any) {
    console.error('Create label error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE - Delete a label
export async function DELETE(request: NextRequest) {
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
    const supabase = createAdminClient()

    const { userId, labelId } = await request.json()

    if (!userId || !labelId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData } = await (supabase as any)
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!
    }

    const gmail = getGmailClient(access_token, refresh_token)

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Delete label error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}