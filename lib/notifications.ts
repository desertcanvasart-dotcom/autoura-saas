/**
 * Notification helpers.
 *
 * The `notifications` table is keyed by `team_member_id` (the tenant-scoped
 * staff directory), not by auth user. There is no `user_id` linkage, so the
 * current user is mapped to their team_member record by email within their
 * active tenant.
 *
 * Creation is a system-level operation (one user triggers a notification for
 * another), so it uses the admin client and bypasses RLS. Callers are
 * responsible for ensuring the target `team_member_id` belongs to the
 * appropriate tenant before calling `createNotification`.
 */

import { createAdminClient } from '@/lib/supabase-server'
import { sendSystemEmail } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateNotificationInput {
  team_member_id: string
  type: string
  title: string
  message: string
  link?: string | null
  related_task_id?: string | null
  send_email?: boolean
}

/**
 * Resolve the team_member record for the authenticated user within a tenant.
 * Mapping is by email (team_members has no user_id column). Returns the
 * team_member id, or null if the user has no matching active staff record.
 */
export async function resolveTeamMemberIdForUser(
  supabase: SupabaseClient,
  tenantId: string,
  email: string | null | undefined
): Promise<string | null> {
  if (!email) return null

  const { data, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return (data as { id: string }).id
}

/**
 * Insert a notification (admin client) and optionally email the recipient.
 * The caller MUST have already validated that `team_member_id` is legitimate
 * for the current tenant.
 */
export async function createNotification(input: CreateNotificationInput) {
  const supabase = createAdminClient() as any

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      team_member_id: input.team_member_id,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      related_task_id: input.related_task_id ?? null,
      is_read: false,
      email_sent: false,
    })
    .select(`
      *,
      team_member:team_members(id, name, email)
    `)
    .single()

  if (error) throw error

  if (input.send_email && notification?.team_member?.email) {
    try {
      await sendEmailNotification(
        notification.team_member.email,
        notification.team_member.name,
        input.title,
        input.message,
        input.link ?? null,
        input.type
      )
      await supabase
        .from('notifications')
        .update({ email_sent: true })
        .eq('id', notification.id)
    } catch (emailError) {
      // Don't fail the whole operation if the email fails.
      console.error('Failed to send email notification:', emailError)
    }
  }

  return notification
}

// Helper function to send an email notification via Resend (system transport).
async function sendEmailNotification(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  link: string | null,
  type: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'

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

  return sendSystemEmail({
    to: toEmail,
    subject: `[Autoura] ${subject}`,
    html: htmlContent,
  })
}
