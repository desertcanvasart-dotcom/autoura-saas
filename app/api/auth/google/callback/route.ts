import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getTokensFromCode, getUserEmail } from '@/lib/gmail'
import { verifyState } from '@/lib/oauth-state'
import { appRedirectBase } from '@/lib/oauth-config'

function getSupabase() {
  return createAdminClient()
}

export async function GET(request: NextRequest) {
  // Railway forwards to the container on PORT (8080), so `request.url` here is
  // http://localhost:8080/... — unreachable from the operator's browser. Every
  // redirect below goes through the public app URL instead.
  const base = appRedirectBase(process.env.NEXT_PUBLIC_APP_URL, request.url)
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // Contains user_id
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/email?error=${error}`, base)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/email?error=missing_params', base)
    )
  }

  // Verify the signed state before trusting the embedded user id — without
  // this, an attacker could initiate their own Google OAuth flow with
  // state=<victim_user_id> and have THEIR tokens written to the victim's
  // gmail_tokens row, hijacking the victim's email-sync identity.
  const userId = verifyState(state)
  if (!userId) {
    return NextResponse.redirect(
      new URL('/settings/email?error=invalid_state', base)
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
        user_id: userId,
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
      new URL('/settings/email?success=true', base)
    )
  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(err.message)}`, base)
    )
  }
}