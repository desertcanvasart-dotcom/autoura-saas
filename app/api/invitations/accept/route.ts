import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

/**
 * POST /api/invitations/accept — mark an invitation as accepted.
 *
 * TOKEN-GATED, not session-gated: the person accepting has just signed up and
 * may hold no session at all (email confirmation delays it), so the secret
 * invitation token IS the credential.
 *
 * This lives on its own path rather than as PUT /api/invitations because the
 * middleware allowlist matches by PATH, not method. While the accept handler
 * sat beside the session-gated GET/POST/DELETE on the collection route, it
 * could not be allowlisted without exposing them — so it was never reachable
 * and every invitee landed on the dashboard with no tenant membership.
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    // The conditions ARE the authorization: pending, unexpired, unused.
    // A token that fails any of them is indistinguishable from a wrong one.
    const { data, error } = await createAdminClient()
      .from('tenant_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('invitation_token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found, expired, or already used' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to accept invitation' },
      { status: 500 }
    )
  }
}
