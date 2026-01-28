import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { logActivity, checkLimit } from '@/lib/billing-middleware'
import crypto from 'crypto'

/**
 * POST /api/admin/tenant/invite
 * Invite a new team member to the tenant
 */
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
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can invite team members'
      }, { status: 403 })
    }

    const body = await request.json()
    const { email, role = 'member', message } = body

    if (!email) {
      return NextResponse.json({
        success: false,
        error: 'Email is required'
      }, { status: 400 })
    }

    if (!['admin', 'manager', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid role. Must be one of: admin, manager, member, viewer'
      }, { status: 400 })
    }

    // Only owners can invite other owners
    if (role === 'owner' && currentMember.role !== 'owner') {
      return NextResponse.json({
        success: false,
        error: 'Only owners can invite other owners'
      }, { status: 403 })
    }

    // Check team members limit
    const limitCheck = await checkLimit(tenant_id, 'team_members', supabase)
    if (!limitCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Team members limit reached',
        limit_reached: true,
        limit: limitCheck.limit,
        current: limitCheck.current,
        upgrade_url: '/admin/billing/plans'
      }, { status: 403 })
    }

    // Note: We skip the existing member check since we can't easily query auth.users
    // The invitation will be created and the user can accept it when they sign up

    // Check if there's a pending invitation
    const { data: existingInvitation } = await supabase
      .from('tenant_invitations')
      .select('id, status')
      .eq('tenant_id', tenant_id)
      .eq('email', email)
      .eq('status', 'pending')
      .single()

    if (existingInvitation) {
      return NextResponse.json({
        success: false,
        error: 'An invitation is already pending for this email'
      }, { status: 400 })
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex')

    // Create invitation
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // Expires in 7 days

    const { data: invitation, error: inviteError } = await supabase
      .from('tenant_invitations')
      .insert({
        tenant_id: tenant_id,
        email,
        role,
        invited_by: user.id,
        invitation_token: invitationToken,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    // Log activity
    await logActivity(
      tenant_id,
      user.id,
      'team.member_invited',
      supabase,
      {
        resourceType: 'tenant_invitation',
        resourceId: invitation.id,
        details: {
          email,
          role
        }
      }
    )

    // TODO: Send invitation email
    // For now, return the invitation link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const invitationLink = `${appUrl}/accept-invitation?token=${invitationToken}`

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email,
        role,
        expires_at: invitation.expires_at,
        invitation_link: invitationLink
      },
      message: 'Invitation created successfully'
    })
  } catch (error: any) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/tenant/invite
 * List all pending invitations
 */
export async function GET(request: NextRequest) {
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
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can view invitations'
      }, { status: 403 })
    }

    // Get all invitations
    const { data: invitations, error } = await supabase
      .from('tenant_invitations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      invitations: invitations || [],
      count: invitations?.length || 0
    })
  } catch (error: any) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
