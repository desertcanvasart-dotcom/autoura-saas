import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { signState } from '@/lib/oauth-state'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user first
    const authClient = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify authenticated user matches requested userId
    if (user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized access to this user data' }, { status: 403 })
    }

    // Sign the user id into the OAuth state so the callback can verify the
    // embedded id wasn't tampered with. Prior code passed `userId` as
    // plaintext state — an attacker could initiate their own Google OAuth
    // flow with `state=<victim_user_id>` and have the callback bind their
    // Google tokens to the victim's gmail_tokens row.
    const authUrl = getAuthUrl(signState(userId))

    return NextResponse.json({ authUrl })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}