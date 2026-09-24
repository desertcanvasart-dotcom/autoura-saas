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
import { sendPushToUsers, type PushPayload } from '@/lib/push'
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
 * The PostgREST `or` filter for "notifications addressed to me": rows for the
 * login itself (user_id, migration 384) and rows for its staff record, if it
 * has one. Both ids come from the server-side session — never from the client.
 */
export async function myNotificationsFilter(
  supabase: SupabaseClient,
  tenantId: string,
  user: { id: string; email?: string | null }
): Promise<string> {
  const teamMemberId = await resolveTeamMemberIdForUser(supabase, tenantId, user.email)
  return teamMemberId
    ? `user_id.eq.${user.id},team_member_id.eq.${teamMemberId}`
    : `user_id.eq.${user.id}`
}

/**
 * Notify a LOGIN once per thing (e.g. one new email). `dedupe_key` is unique
 * per user (migration 384), so a second insert of the same key — another tab
 * polling at the same moment — is silently ignored. In-app only; no email.
 */
export async function notifyUserOnce(input: {
  user_id: string
  dedupe_key: string
  type: string
  title: string
  message: string
  link?: string | null
}) {
  const { data: filed, error } = await createAdminClient()
    .from('notifications')
    .upsert(
      {
        user_id: input.user_id,
        dedupe_key: input.dedupe_key,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        is_read: false,
        email_sent: false,
      },
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
    )
    .select('id')
  if (error) throw error
  // Only the insert that actually filed it rings the phone: a duplicate comes
  // back empty, so two racing checks cannot alert twice.
  if ((filed ?? []).length > 0) {
    await sendPushToUsers([input.user_id], pushPayload(input))
  }
  return (filed ?? []).length > 0
}

/** The phone/desktop alert for a bell item. `tag` = the dedupe key, so a new
 *  message in the same chat replaces its alert instead of stacking a second. */
function pushPayload(input: { dedupe_key: string; title: string; message: string; link?: string | null }): PushPayload {
  return { title: input.title, body: input.message, url: input.link ?? '/dashboard', tag: input.dedupe_key }
}

/**
 * Notify EVERYONE on the tenant's team — every active login (tenant_members),
 * whatever their role. Operator, 2026-09-24: new WhatsApp messages and new
 * concierge leads go to "everyone on the team".
 *
 * One bell item per person per THING (the dedupe_key, e.g. wa:<conversation>),
 * not per event: a customer sending five messages in a row leaves one item
 * that says the latest, bumped back to unread and to the top — not five.
 * In-app only; no email. Throws on failure — callers treat it as best-effort.
 */
export async function notifyTeam(input: {
  tenant_id: string
  dedupe_key: string
  type: string
  title: string
  message: string
  link?: string | null
}) {
  const admin = createAdminClient()
  const { data: members, error: membersError } = await admin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', input.tenant_id)
    .eq('status', 'active')
  if (membersError) throw membersError

  const userIds = [...new Set((members ?? []).map(m => m.user_id).filter((id): id is string => !!id))]
  if (userIds.length === 0) return

  const now = new Date().toISOString()
  const { error } = await admin.from('notifications').upsert(
    userIds.map(user_id => ({
      user_id,
      dedupe_key: input.dedupe_key,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      is_read: false,
      email_sent: false,
      created_at: now, // a repeat moves it back to the top of the bell
    })),
    { onConflict: 'user_id,dedupe_key' }
  )
  if (error) throw error
  // Every event rings: each is new (a new message, a new or reopened lead).
  await sendPushToUsers(userIds, pushPayload(input))
}

/**
 * The thing has been dealt with (a chat read, a lead picked up) — for the
 * whole team, so its bell item goes read for everyone. Keys carry the
 * conversation/brief UUID, so they cannot collide across tenants.
 * Best-effort: logs, never throws.
 */
export async function markTeamNotificationsRead(dedupe_key: string) {
  const { error } = await createAdminClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('dedupe_key', dedupe_key)
    .eq('is_read', false)
  if (error) console.error(`marking ${dedupe_key} notifications read failed:`, error.message)
}

/** Shorten a message body for a bell line. */
export function bellSnippet(text: string | null | undefined, max = 140): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
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
