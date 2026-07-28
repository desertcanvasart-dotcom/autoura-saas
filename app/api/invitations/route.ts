import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email-send'
import crypto from 'crypto'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { checkRateLimit, getRateLimitIdentifier, rateLimitResponse } from '@/lib/rate-limit'

// Role hierarchy for invitation gating. An inviter may only assign roles
// strictly below their own rank, so no invitation can escalate privileges
// (in particular, a second owner can never be created via this API).
const ROLE_RANK: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
}

// GET - List invitations for the caller's tenant (manager+)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    if ((ROLE_RANK[authResult.role || ''] || 0) < ROLE_RANK.manager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // pending, accepted, expired, all

    let query = (createAdminClient() as any)
      .from('tenant_invitations')
      .select(`
        *,
        inviter:user_profiles!invited_by(id, full_name, email)
      `)
      .eq('tenant_id', authResult.tenant_id)
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

// POST - Create new invitation (manager+; invited role must rank below the inviter's)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const inviterRank = ROLE_RANK[authResult.role || ''] || 0
    if (inviterRank < ROLE_RANK.manager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Throttle invite creation per authenticated user (un-spoofable id).
    const rl = checkRateLimit(getRateLimitIdentifier(request, authResult.user!.id), 'invitation')
    if (!rl.success) {
      return rateLimitResponse(rl)
    }

    const body = await request.json()
    const { email, role = 'member' } = body
    // tenant_id and invited_by always come from the session — never the body.
    const tenant_id = authResult.tenant_id
    const invited_by = authResult.user!.id

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Validate role
    if (!(role in ROLE_RANK)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }
    if (ROLE_RANK[role] >= inviterRank) {
      return NextResponse.json(
        { success: false, error: 'You can only invite roles below your own' },
        { status: 403 }
      )
    }

    const supabase = createAdminClient()

    // Check if user already exists
    const { data: existingUser } = await (supabase as any)
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

    // Check if there's already a pending invitation for this tenant
    const { data: existingInvitation } = await (supabase as any)
      .from('tenant_invitations')
      .select('id')
      .eq('tenant_id', tenant_id)
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
    const { data: invitation, error } = await (supabase as any)
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

    let emailSent = true
    let emailError: string | null = null
    try {
      await sendInvitationEmail(email, role, inviteUrl)
    } catch (err: any) {
      console.error('Failed to send invitation email:', err)
      emailSent = false
      emailError = err?.message || 'Email could not be sent'
      // The invitation row is still valid and inviteUrl is returned, so the
      // inviter can share the link manually — but they are TOLD, rather than
      // believing an email went out that never did.
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      emailSent,
      emailError,
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

// NOTE: the accept handler moved to POST /api/invitations/accept (its own
// path so the middleware — which allowlists by PATH, not method — can let an
// unauthenticated invitee reach it without exposing the session-gated
// handlers here).

// DELETE - Cancel/delete invitation (manager+, own tenant only)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    if ((ROLE_RANK[authResult.role || ''] || 0) < ROLE_RANK.manager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID is required' },
        { status: 400 }
      )
    }

    const { error } = await createAdminClient()
      .from('tenant_invitations')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

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

  // Sent directly through Resend, not via an HTTP hop to /api/gmail/send.
  // That route sends through a specific USER'S connected Gmail mailbox
  // (it requires userId and reads gmail_tokens) — wrong transport for
  // platform mail. It was also unreachable from here (not in the middleware
  // allowlist, so 401) and was being called with {to,subject,html} while it
  // requires {userId,to,subject,body}. Two failures stacked, both swallowed
  // by the caller's try/catch: no invitation email has ever been sent.
  const result = await sendMail({
    to: toEmail,
    subject: `You're invited to join Autoura`,
    html: htmlContent,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send invitation email')
  }

  return result
}
