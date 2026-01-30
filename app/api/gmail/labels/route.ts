import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { refreshAccessToken } from '@/lib/gmail'
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

// Lazy-initialized OAuth2 client
let _oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null

function getOAuth2Client() {
  if (!_oauth2Client) {
    _oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
  }
  return _oauth2Client
}

// GET - Fetch all labels
export async function GET(request: NextRequest) {
  try {
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await getSupabase()
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
      
      await getSupabase()
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
        })
        .eq('user_id', userId)
    }

    getOAuth2Client().setCredentials({ access_token, refresh_token })
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() })

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
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { userId, name, backgroundColor, textColor } = await request.json()

    if (!userId || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData, error: tokenError } = await getSupabase()
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

    getOAuth2Client().setCredentials({ access_token, refresh_token })
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() })

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
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { userId, labelId } = await request.json()

    if (!userId || !labelId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    const { data: tokenData } = await getSupabase()
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

    getOAuth2Client().setCredentials({ access_token, refresh_token })
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() })

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