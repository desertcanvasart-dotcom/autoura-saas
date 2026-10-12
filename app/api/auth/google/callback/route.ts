import { tenantForUser, type MembershipRow } from '@/lib/email/scheduled-sync'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getTokensFromCode, getUserEmail, GMAIL_SCOPES } from '@/lib/gmail'
import { missingGoogleScopes } from '@/lib/google-scopes'
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
  // The payload is `${userId}:${tenantId}` (the company the person was
  // working in when they clicked Connect); a state from before migration 415
  // carries the user id alone.
  const payload = verifyState(state)
  const [userId, stateTenant] = (payload ?? '').split(':')
  if (!payload || !userId) {
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

    // Google's granular consent lets the user untick a permission and still
    // hand back a valid token; it was saved as a working connection and the
    // first send/sync failed with a 403 (documents audit, round 12). Every
    // scope the connect route requested must be granted, or nothing is saved.
    const missingScopes = missingGoogleScopes(tokens.scope, GMAIL_SCOPES)
    if (missingScopes.length > 0) {
      console.error('OAuth callback: scopes not granted', { userId, missingScopes })
      return NextResponse.redirect(
        new URL('/settings/email?error=missing_scopes', base)
      )
    }

    // Get user's email
    const email = await getUserEmail(tokens.access_token)

    // Calculate token expiry
    const expiryDate = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000))

    // Which company this mailbox is filed under. The row used to be written
    // without one — every production mailbox had tenant_id NULL — and the
    // scheduled sweep skips a mailbox it cannot place. Same rule as the sweep.
    const { data: memberships } = await getSupabase()
      .from('tenant_members')
      .select('user_id, tenant_id, joined_at')
      .eq('user_id', userId)
      .eq('status', 'active') // the one company rule (migration 390)
    // The signed company, while the person is still an active member of it;
    // otherwise (an older state) the oldest-membership rule.
    const tenantId = stateTenant && (memberships ?? []).some(m => m.tenant_id === stateTenant)
      ? stateTenant
      : tenantForUser(userId, null, (memberships ?? []) as MembershipRow[])
    if (!tenantId) {
      return NextResponse.redirect(new URL('/settings/email?error=no_company', base))
    }

    // Upsert token record
    const { error: dbError } = await (getSupabase() as any)
      .from('gmail_tokens')
      .upsert({
        user_id: userId,
        // One mailbox per person per company (migration 415).
        tenant_id: tenantId,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,tenant_id'
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