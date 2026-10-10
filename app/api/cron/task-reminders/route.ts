import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email-send'
import { createClient } from '@supabase/supabase-js'
import { withJobRun } from '@/lib/support/job-runs'
import { shiftDateISO, todayInTimeZone } from '@/lib/today'
import { resolveTimeZone } from '@/lib/tenant-today'
import { daysOverdue, reminderChannels, taskReminderKind, type NotificationPreferences } from '@/lib/tasks/task-reminders'

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

// This endpoint should be called by a cron job (Railway cron, Vercel cron, or external service)
// Recommended: Run daily at 8:00 AM local time
// 
// Railway: Add to railway.json or use Railway cron
// Vercel: Add to vercel.json crons
// External: Use cron-job.org or similar service

async function getHandler(request: NextRequest) {
  // Verify cron secret. Fail closed: if no secret is configured, or the
  // header doesn't match, reject. Never run unauthenticated.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const results = {
      dueSoon: 0,
      overdue: 0,
      errors: [] as string[]
    }

    const db = getSupabase() as any
    // Everything due by the day after tomorrow in UTC — the furthest-ahead
    // timezone's tomorrow — and not done; each task is then judged on its own
    // company's day (tenants.timezone, lib/tenant-today).
    const horizon = shiftDateISO(new Date().toISOString().slice(0, 10), 2)
    const { data: tasks, error: tasksError } = await db
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email, user_id, is_active)
      `)
      .lte('due_date', horizon)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)
      // An archived task is off the board; it must not keep reminding anyone.
      .or('archived.eq.false,archived.is.null')

    if (tasksError) {
      results.errors.push(`Task query error: ${tasksError.message}`)
    }

    const rows = (tasks ?? []) as any[]
    const tenantIds = [...new Set(rows.map(t => t.tenant_id).filter(Boolean))]
    const zones = new Map<string, string>()
    if (tenantIds.length) {
      const { data: tenants } = await db.from('tenants').select('id, timezone').in('id', tenantIds)
      for (const t of tenants ?? []) zones.set(t.id, resolveTimeZone(t.timezone))
    }
    const userIds = [...new Set(rows.map(t => t.assigned_member?.user_id).filter(Boolean))]
    const prefsByUser = new Map<string, NotificationPreferences>()
    if (userIds.length) {
      const { data: settings } = await db.from('user_settings').select('user_id, notification_preferences').in('user_id', userIds)
      for (const s of settings ?? []) if (s.notification_preferences) prefsByUser.set(s.user_id, s.notification_preferences)
    }

    for (const task of rows) {
      const member = task.assigned_member
      // A removed (deactivated) team member is not reminded.
      if (!member?.id || member.is_active === false) continue

      const todayStr = todayInTimeZone(zones.get(task.tenant_id) ?? resolveTimeZone(null))
      const kind = taskReminderKind(task.due_date, todayStr)
      if (!kind) continue

      const channels = reminderChannels(member.user_id ? prefsByUser.get(member.user_id) : null, kind)
      if (!channels.remind) continue

      // Not again: due-soon once a day, overdue once every three days.
      const since = kind === 'task_due_soon'
        ? todayStr
        : new Date(Date.now() - 3 * 86_400_000).toISOString()
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('related_task_id', task.id)
        .eq('type', kind)
        .gte('created_at', since)
        .limit(1)
      if (existing && existing.length > 0) continue

      if (kind === 'task_due_soon') {
        await createNotification({
          team_member_id: member.id,
          type: kind,
          title: `Task due tomorrow: ${task.title}`,
          message: `Your task "${task.title}" is due tomorrow (${formatDate(task.due_date)}). Please complete it soon.`,
          link: `/tasks`,
          related_task_id: task.id,
          email: channels.email ? member.email : undefined,
          name: member.name,
          inApp: channels.inApp,
        })
        results.dueSoon++
      } else {
        const days = daysOverdue(task.due_date, todayStr)
        await createNotification({
          team_member_id: member.id,
          type: kind,
          title: `Overdue task: ${task.title}`,
          message: `Your task "${task.title}" is ${days} day${days > 1 ? 's' : ''} overdue (was due ${formatDate(task.due_date)}). Please complete it as soon as possible.`,
          link: `/tasks`,
          related_task_id: task.id,
          email: channels.email ? member.email : undefined,
          name: member.name,
          inApp: channels.inApp,
        })
        results.overdue++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Task reminders sent: ${results.dueSoon} due soon, ${results.overdue} overdue`,
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in task reminders cron:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process task reminders' },
      { status: 500 }
    )
  }
}

// Also support POST for some cron services
export async function POST(request: NextRequest) {
  return GET(request)
}

// Helper to create notification and send email
async function createNotification({
  team_member_id,
  type,
  title,
  message,
  link,
  related_task_id,
  email,
  name,
  inApp = true,
}: {
  team_member_id: string
  type: string
  title: string
  message: string
  link: string
  related_task_id: string
  email?: string
  name?: string
  /** Off in the person's settings: the row is still written — it is what
   *  stops the reminder repeating — but already read, so it does not show. */
  inApp?: boolean
}) {
  // Insert notification
  const { data: notification, error } = await (getSupabase() as any)
    .from('notifications')
    .insert({
      team_member_id,
      type,
      title,
      message,
      link,
      related_task_id,
      is_read: !inApp,
      email_sent: false
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating notification:', error)
    return null
  }

  // Send email if team member has email
  if (email && name) {
    try {
      await sendReminderEmail(email, name, title, message, link, type)
      
      // Mark email as sent
      await (getSupabase() as any)
        .from('notifications')
        .update({ email_sent: true })
        .eq('id', notification.id)
    } catch (emailError) {
      console.error('Failed to send reminder email:', emailError)
    }
  }

  return notification
}

// Helper to send email
async function sendReminderEmail(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  link: string,
  type: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
  
  const typeConfig = {
    task_due_soon: { color: '#F59E0B', icon: '⏰', bgColor: '#FEF3C7' },
    task_overdue: { color: '#EF4444', icon: '🚨', bgColor: '#FEE2E2' }
  }
  
  const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.task_due_soon

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
          <div style="background-color: ${config.bgColor}; padding: 24px; text-align: center; border-bottom: 3px solid ${config.color};">
            <span style="font-size: 40px;">${config.icon}</span>
            <h1 style="color: ${config.color}; margin: 12px 0 0 0; font-size: 18px; font-weight: 600;">Task Reminder</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">Hi ${toName},</p>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">${message}</p>
            
            <div style="text-align: center;">
              <a href="${baseUrl}${link}" style="display: inline-block; background-color: ${config.color}; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                View Tasks
              </a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">
              Autoura Task Management • This is an automated reminder
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  // Resend directly: /api/gmail/send routes through a specific user's
  // connected Gmail mailbox (needs userId + gmail_tokens), which is the wrong
  // transport for a platform reminder — and it was unreachable from here
  // anyway (not in the middleware allowlist → 401) and called with the wrong
  // body shape. No task reminder has ever been delivered.
  const result = await sendMail({
    to: toEmail,
    subject: `[Autoura] ${subject}`,
    html: htmlContent,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send task reminder')
  }

  return result
}

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  })
}

// ============================================
// Recorded, so the support bundle can answer "has this job ever run here?"
// ============================================
// Nothing in this app schedules itself — the scheduler is external, so the job
// saying so is the only evidence it ever ran. Fail-open: if the recording cannot
// happen, the job still runs (lib/support/job-runs.ts).
export const GET = withJobRun('task-reminders', () => getSupabase(), getHandler)
