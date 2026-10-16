import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { signState } from '@/lib/oauth-state'
import { checkGoogleRedirect } from '@/lib/oauth-config'
import { currentTenantId, type MembershipDb } from '@/lib/current-membership'

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
    //
    // The company is signed in too: the mailbox is filed under the company
    // the person is working in now (migration 415: one per person per
    // company), not whichever the callback would guess.
    const { tenantId } = await currentTenantId(authClient as unknown as MembershipDb)
    if (!tenantId) {
      return NextResponse.json({ error: 'No active company' }, { status: 403 })
    }
    const authUrl = getAuthUrl(signState(`${userId}:${tenantId}`))

    return NextResponse.json({ authUrl, redirect_uri: redirectCheck.redirectUri })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
// DELETE — disconnect this person's mailbox in the current company: the grant
// is revoked at Google, then the stored tokens are deleted (lib/gmail-revoke).
// The page used to delete the row from the browser, leaving the grant live.
export async function DELETE() {
  const { requireAuth } = await import('@/lib/supabase-server')
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.tenant_id) return NextResponse.json({ error: 'No active company' }, { status: 403 })
  const { revokeAndForgetMailbox } = await import('@/lib/gmail-revoke')
  const result = await revokeAndForgetMailbox(auth.user!.id, auth.tenant_id)
  if (result.error) return NextResponse.json({ error: 'Could not disconnect Gmail' }, { status: 500 })
  return NextResponse.json({ success: true, revoked: result.revoked })
}
