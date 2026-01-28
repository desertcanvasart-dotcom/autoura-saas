import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Verify service role key exists
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set!')
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const adminClient = createAdminClient()

    console.log('🔑 Creating team invitations for:', {
      tenant_id,
      user_id: user?.id,
      user_email: user?.email,
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    const body = await request.json()

    const members = body.members || []

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No team members provided' },
        { status: 400 }
      )
    }

    // Validate members
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const member of members) {
      if (!member.email || !emailRegex.test(member.email)) {
        return NextResponse.json(
          { success: false, error: `Invalid email: ${member.email}` },
          { status: 400 }
        )
      }
      if (!member.role || !['admin', 'manager', 'member', 'viewer'].includes(member.role)) {
        return NextResponse.json(
          { success: false, error: `Invalid role: ${member.role}` },
          { status: 400 }
        )
      }
    }

    // Generate invitations
    const invitations = members.map(member => ({
      tenant_id,
      email: member.email.toLowerCase().trim(),
      role: member.role,
      invited_by: user?.id,
      invitation_token: crypto.randomBytes(32).toString('hex'),
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    }))

    console.log('📧 Attempting to insert invitations:', {
      count: invitations.length,
      invitations: invitations.map(i => ({ email: i.email, role: i.role }))
    })

    // Insert invitations using admin client to bypass RLS
    // (permissions already validated by requireAuth)
    const { data: insertedInvitations, error: invitationError } = await adminClient
      .from('tenant_invitations')
      .insert(invitations)
      .select()

    if (invitationError) {
      console.error('❌ Error creating invitations:', {
        error: invitationError,
        code: invitationError.code,
        message: invitationError.message,
        details: invitationError.details,
        hint: invitationError.hint
      })
      return NextResponse.json(
        { success: false, error: 'Failed to create invitations' },
        { status: 500 }
      )
    }

    // TODO: Send invitation emails via email service (Resend, SendGrid, etc.)
    // For now, we'll just log the invitation links for manual testing
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    console.log('\n' + '='.repeat(80))
    console.log('📧 TEAM INVITATIONS CREATED (Email sending not configured)')
    console.log('='.repeat(80))

    insertedInvitations?.forEach(inv => {
      const inviteUrl = `${baseUrl}/accept-invite?token=${inv.invitation_token}`
      console.log(`\n👤 ${inv.email} (${inv.role})`)
      console.log(`🔗 ${inviteUrl}`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('To enable email sending, set up an email service in the TODO section above')
    console.log('='.repeat(80) + '\n')

    // Update onboarding step
    const { error: stepError } = await supabase
      .from('tenant_features')
      .update({
        onboarding_step: Math.max(3, body.current_step || 3),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenant_id)

    if (stepError) {
      console.error('Error updating onboarding step:', stepError)
      // Don't fail the request if step update fails
    }

    return NextResponse.json({
      success: true,
      message: `${invitations.length} invitation${invitations.length > 1 ? 's' : ''} created successfully`,
      data: {
        invitations: insertedInvitations?.map(inv => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          expires_at: inv.expires_at
        })),
        note: 'Email sending not configured. Invitation links logged to server console.'
      }
    })
  } catch (error) {
    console.error('Error in onboarding team POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
