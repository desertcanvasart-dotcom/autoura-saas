import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, createAdminClient } from '@/lib/supabase-server'
import { getTokensFromCode, getUserEmail } from '@/lib/gmail'

function getSupabase() {
  return createAdminClient()
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // Contains user_id
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/email?error=${error}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/email?error=missing_params', request.url)
    )
  }

  // Authenticate via the session cookies (this redirect runs in the user's own
  // browser). The tokens are stored against the SESSION user, never the
  // attacker-controllable `state` parameter.
  const authClient = await createAuthenticatedClient()
  const { data: { user }, error: userError } = await authClient.auth.getUser()

  if (userError || !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Reject forged callbacks: state must match the logged-in user
  if (state !== user.id) {
    return NextResponse.redirect(
      new URL('/settings/email?error=state_mismatch', request.url)
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('No tokens received')
    }

    // Get user's email
    const email = await getUserEmail(tokens.access_token)

    // Calculate token expiry
    const expiryDate = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000))

    // Upsert token record
    const { error: dbError } = await (getSupabase() as any)
      .from('gmail_tokens')
      .upsert({
        user_id: user.id,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save tokens')
    }

    return NextResponse.redirect(
      new URL('/settings/email?success=true', request.url)
    )
  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(err.message)}`, request.url)
    )
  }
}