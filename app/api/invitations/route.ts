import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

// GET - List all invitations (admin/manager only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // pending, accepted, expired, all

    let query = (getSupabase() as any)
      .from('tenant_invitations')
      .select(`
        *,
        inviter:user_profiles!invited_by(id, full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (status === 'pending') {
      query = query.is('accepted_at', null).gt('expires_at', new Date().toISOString())
    } else if (status === 'accepted') {
      query = query.not('accepted_at', 'is', null)
    } else if (status === 'expired') {
      query = query.is('accepted_at', null).lt('expires_at', new Date().toISOString())
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}

// POST - Create new invitation (admin/manager only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, role = 'member', invited_by, tenant_id } = body

    // Validate tenant_id
    if (!tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID is required' },
        { status: 400 }
      )
    }

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'manager', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await (getSupabase() as any)
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Check if there's already a pending invitation
    const { data: existingInvitation } = await (getSupabase() as any)
      .from('tenant_invitations')
      .select('id')
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingInvitation) {
      return NextResponse.json(
        { success: false, error: 'Pending invitation already exists for this email' },
        { status: 400 }
      )
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    
    // Set expiration to 7 days from now
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create invitation
    const { data: invitation, error } = await (getSupabase() as any)
      .from('tenant_invitations')
      .insert({
        tenant_id,
        email: email.toLowerCase(),
        role,
        invited_by,
        invitation_token: token,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const inviteUrl = `${baseUrl}/invite/accept?token=${token}`

    try {
      await sendInvitationEmail(email, role, inviteUrl)
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
      // Don't fail the request, invitation is still created
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      inviteUrl // Return URL in case email fails
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}

// PUT - Mark invitation as accepted
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    // Update invitation status
    const { data, error } = await (getSupabase() as any)
      .from('tenant_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('invitation_token', token)
      .select()
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update invitation' },
      { status: 500 }
    )
  }
}

// DELETE - Cancel/delete invitation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID is required' },
        { status: 400 }
      )
    }

    const { error } = await getSupabase()
      .from('tenant_invitations')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled'
    })
  } catch (error) {
    console.error('Error deleting invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete invitation' },
      { status: 500 }
    )
  }
}

// Helper function to send invitation email
async function sendInvitationEmail(
  toEmail: string,
  role: string,
  inviteUrl: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
  
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    agent: 'Agent',
    viewer: 'Viewer'
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: #647C47; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">You're Invited! 🎉</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 32px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">
              You've been invited to join <strong>Autoura</strong> as a <strong>${roleLabels[role] || role}</strong>.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px 0;">
              Autoura is a travel operations management platform that helps teams manage clients, itineraries, tasks, and more.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background-color: #647C47; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0 0; text-align: center;">
              This invitation will expire in 7 days.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  const response = await fetch(`${baseUrl}/api/gmail/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toEmail,
      subject: `You're invited to join Autoura`,
      html: htmlContent
    })
  })

  if (!response.ok) {
    throw new Error('Failed to send invitation email')
  }

  return response.json()
}