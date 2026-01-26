import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch notifications for a team member
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamMemberId = searchParams.get('teamMemberId')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('notifications')
      .select(`
        *,
        team_member:team_members(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (teamMemberId) {
      query = query.eq('team_member_id', teamMemberId)
    }

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) {
      // If table doesn't exist, return empty results
      if (error.message?.includes('Could not find the table')) {
        console.log('Notifications table does not exist yet, returning empty results')
        return NextResponse.json({
          success: true,
          data: [],
          unreadCount: 0
        })
      }
      throw error
    }

    // Also get unread count
    let countQuery = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)

    if (teamMemberId) {
      countQuery = countQuery.eq('team_member_id', teamMemberId)
    }

    const { count: unreadCount } = await countQuery

    return NextResponse.json({
      success: true,
      data,
      unreadCount: unreadCount || 0
    })
  } catch (error: any) {
    console.error('Error fetching notifications:', error)
    // If table doesn't exist, return empty results instead of error
    if (error.message?.includes('Could not find the table')) {
      return NextResponse.json({
        success: true,
        data: [],
        unreadCount: 0
      })
    }
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

// POST - Create a new notification
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      team_member_id, 
      type, 
      title, 
      message, 
      link, 
      related_task_id,
      send_email = true 
    } = body

    // Insert notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        team_member_id,
        type,
        title,
        message,
        link,
        related_task_id,
        is_read: false,
        email_sent: false
      })
      .select(`
        *,
        team_member:team_members(id, name, email)
      `)
      .single()

    if (error) throw error

    // Send email notification if requested and team member has email
    if (send_email && notification.team_member?.email) {
      try {
        await sendEmailNotification(
          notification.team_member.email,
          notification.team_member.name,
          title,
          message,
          link,
          type
        )
        
        // Mark email as sent
        await supabase
          .from('notifications')
          .update({ email_sent: true })
          .eq('id', notification.id)
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError)
        // Don't fail the whole request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      data: notification
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    )
  }
}

// Notification types reference:
// - task_assigned: New task assigned
// - task_due_soon: Task due soon reminder  
// - task_overdue: Task is overdue
// - task_completed: Task was completed
// - whatsapp_assigned: WhatsApp conversation assigned
// - whatsapp_new_message: New message in assigned chat

// Helper function to send email via Gmail API
async function sendEmailNotification(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  link: string | null,
  type: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
  
  // Get notification type styling
  const typeConfig: Record<string, { color: string; icon: string; label: string; buttonText: string }> = {
    task_assigned: { color: '#647C47', icon: '📋', label: 'New Task Assigned', buttonText: 'View Task' },
    task_due_soon: { color: '#F59E0B', icon: '⏰', label: 'Task Due Soon', buttonText: 'View Task' },
    task_overdue: { color: '#EF4444', icon: '🚨', label: 'Task Overdue', buttonText: 'View Task' },
    task_completed: { color: '#10B981', icon: '✅', label: 'Task Completed', buttonText: 'View Task' },
    whatsapp_assigned: { color: '#25D366', icon: '💬', label: 'WhatsApp Chat Assigned', buttonText: 'Open Chat' },
    whatsapp_new_message: { color: '#25D366', icon: '📱', label: 'New WhatsApp Message', buttonText: 'View Message' },
  }
  
  const config = typeConfig[type] || { color: '#647C47', icon: '🔔', label: 'Notification', buttonText: 'View' }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: ${config.color}; padding: 24px; text-align: center;">
            <span style="font-size: 32px;">${config.icon}</span>
            <h1 style="color: white; margin: 12px 0 0 0; font-size: 20px; font-weight: 600;">${config.label}</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 8px 0;">Hi ${toName},</p>
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0; white-space: pre-line;">${message}</p>
            
            ${link ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${baseUrl}${link}" style="display: inline-block; background-color: ${config.color}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  ${config.buttonText}
                </a>
              </div>
            ` : ''}
            
            ${type === 'whatsapp_assigned' ? `
              <div style="margin-top: 16px; padding: 12px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #25D366;">
                <p style="color: #166534; font-size: 13px; margin: 0;">
                  <strong>💡 Tip:</strong> Respond quickly to maintain good customer engagement!
                </p>
              </div>
            ` : ''}
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              This notification was sent from Autoura Operations System
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0 0; text-align: center;">
              <a href="${baseUrl}/notifications" style="color: #6b7280;">View all notifications</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  // Send via Gmail API
  const response = await fetch(`${baseUrl}/api/gmail/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toEmail,
      subject: `[Autoura] ${subject}`,
      html: htmlContent
    })
  })

  if (!response.ok) {
    throw new Error('Failed to send email via Gmail API')
  }

  return response.json()
}