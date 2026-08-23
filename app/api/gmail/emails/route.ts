import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { fetchEmails, refreshAccessToken } from '@/lib/gmail'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects email access
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, user } = authResult
    if (!supabase || !user) {
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

    // Gmail tokens for the signed-in user.
    //
    // Read with the admin client, not `supabase` (the RLS-bound client from
    // requireAuth). Migration 273 revokes access_token/refresh_token from
    // `authenticated`, so this `select` — which needs both — must not go
    // through that role. The user filter is what RLS was contributing and it
    // is already explicit: `userId` is `user.id`, never a request parameter.
    const { data: tokenData, error: tokenError } = await getSupabaseAdmin()
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData as any

    if (!refresh_token) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    // Check if token is expired (missing expiry is treated as expired)
    if (!token_expiry || new Date(token_expiry) <= new Date()) {
      // Refresh the token
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      // Update tokens using admin client (token refresh needs admin permissions)
      await (getSupabaseAdmin() as any)
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
