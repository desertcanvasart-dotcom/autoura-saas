import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { signState } from '@/lib/oauth-state'
import { checkGoogleRedirect } from '@/lib/oauth-config'

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

    // Refuse to start the flow on a broken redirect. Google honours whatever
    // redirect we send if it is registered, so a stale value sends a real
    // operator through the consent screen to a dead tab — the failure surfaces
    // in their browser, not here, with nothing naming the cause.
    const redirectCheck = checkGoogleRedirect(
      process.env.GOOGLE_REDIRECT_URI,
      process.env.NEXT_PUBLIC_APP_URL
    )
    if (!redirectCheck.ok) {
      console.error('Gmail connect blocked:', redirectCheck.hint)
      return NextResponse.json(
        {
          error: redirectCheck.error,
          details: redirectCheck.hint,
          // Reported so a config change can be confirmed from outside the
          // deployment — this is the value the RUNNING instance would use.
          redirect_uri: redirectCheck.redirectUri,
        },
        { status: 503 }
      )
    }

    // Sign the user id into the OAuth state so the callback can verify the
    // embedded id wasn't tampered with. Prior code passed `userId` as
    // plaintext state — an attacker could initiate their own Google OAuth
    // flow with `state=<victim_user_id>` and have the callback bind their
    // Google tokens to the victim's gmail_tokens row.
    const authUrl = getAuthUrl(signState(userId))

    return NextResponse.json({ authUrl, redirect_uri: redirectCheck.redirectUri })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}