import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { fetchEmails, refreshAccessToken } from '@/lib/gmail'
import { createClient } from '@supabase/supabase-js'

// Admin client only for token updates (not for reading tokens)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects email access
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, user } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query') || ''
    const pageToken = searchParams.get('pageToken') || undefined
    const maxResults = parseInt(searchParams.get('maxResults') || '20')

    // ✅ SECURITY: Use authenticated user's ID only - prevents user impersonation
    // Remove ability to specify userId in query params
    const userId = user.id

    // Get authenticated user's Gmail tokens (RLS enforces user can only access their own)
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    // Check if token is expired
    if (new Date(token_expiry) <= new Date()) {
      // Refresh the token
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      // Update tokens using admin client (token refresh needs admin permissions)
      await supabaseAdmin
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Fetch emails
    const { messages, nextPageToken } = await fetchEmails(
      access_token,
      refresh_token,
      { maxResults, query, pageToken }
    )

    return NextResponse.json({ messages, nextPageToken })
  } catch (err: any) {
    console.error('Fetch emails error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
