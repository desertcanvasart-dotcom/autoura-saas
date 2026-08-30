import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// GET - Verify invitation token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    // Find invitation by token.
    //
    // The inviter is fetched separately rather than embedded. The embed
    // `inviter:user_profiles!invited_by` requires a foreign key that does not
    // exist, so PostgREST answered PGRST200 and this route treated the failure
    // as `error` — telling every invited person their valid link was an
    // "Invalid invitation token". Nobody could accept an invitation.
    const db = getSupabase() as any
    const { data: invitation, error } = await db
      .from('tenant_invitations')
      .select('*')
      .eq('invitation_token', token)
      .single()

    if (error || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been used' },
        { status: 400 }
      )
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This invitation has expired' },
        { status: 400 }
      )
    }

    let inviter: { full_name?: string; email?: string } | null = null
    if (invitation.invited_by) {
      const { data: profile } = await db
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', invitation.invited_by)
        .maybeSingle()
      inviter = profile ?? null
    }

    return NextResponse.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        inviter,
        expires_at: invitation.expires_at
      }
    })
  } catch (error) {
    console.error('Error verifying invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to verify invitation' },
      { status: 500 }
    )
  }
}