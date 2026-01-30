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

// This endpoint should be called by a cron job (Railway cron, Vercel cron, or external service)
// Recommended: Run daily at 8:00 AM local time
// 
// Railway: Add to railway.json or use Railway cron
// Vercel: Add to vercel.json crons
// External: Use cron-job.org or similar service

export async function GET(request: NextRequest) {
  // Optional: Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // =========================================
    // 1. Find tasks due tomorrow (24h warning)
    // =========================================
    const { data: dueSoonTasks, error: dueSoonError } = await (getSupabase() as any)
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email)
      `)
      .eq('due_date', tomorrowStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)

    if (dueSoonError) {
      results.errors.push(`Due soon query error: ${dueSoonError.message}`)
    } else if (dueSoonTasks && dueSoonTasks.length > 0) {
      for (const task of dueSoonTasks) {
        if (!task.assigned_member?.id) continue

        // Check if we already sent this notification today
        const { data: existing } = await (getSupabase() as any)
          .from('notifications')
          .select('id')
          .eq('related_task_id', task.id)
          .eq('type', 'task_due_soon')
          .gte('created_at', todayStr)
          .limit(1)

        if (existing && existing.length > 0) continue // Already notified

        // Create notification
        await createNotification({
          team_member_id: task.assigned_member.id,
          type: 'task_due_soon',
          title: `Task due tomorrow: ${task.title}`,
          message: `Your task "${task.title}" is due tomorrow (${formatDate(task.due_date)}). Please complete it soon.`,
          link: `/tasks`,
          related_task_id: task.id,
          email: task.assigned_member.email,
          name: task.assigned_member.name
        })
        
        results.dueSoon++
      }
    }

    // =========================================
    // 2. Find overdue tasks
    // =========================================
    const { data: overdueTasks, error: overdueError } = await (getSupabase() as any)
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email)
      `)
      .lt('due_date', todayStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)

    if (overdueError) {
      results.errors.push(`Overdue query error: ${overdueError.message}`)
    } else if (overdueTasks && overdueTasks.length > 0) {
      for (const task of overdueTasks) {
        if (!task.assigned_member?.id) continue

        // Check if we already sent overdue notification in last 3 days
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
        
        const { data: existing } = await (getSupabase() as any)
          .from('notifications')
          .select('id')
          .eq('related_task_id', task.id)
          .eq('type', 'task_overdue')
          .gte('created_at', threeDaysAgo.toISOString())
          .limit(1)

        if (existing && existing.length > 0) continue // Already notified recently

        const daysOverdue = Math.floor((today.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24))

        // Create notification
        await createNotification({
          team_member_id: task.assigned_member.id,
          type: 'task_overdue',
          title: `Overdue task: ${task.title}`,
          message: `Your task "${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue (was due ${formatDate(task.due_date)}). Please complete it as soon as possible.`,
          link: `/tasks`,
          related_task_id: task.id,
          email: task.assigned_member.email,
          name: task.assigned_member.name
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
  name
}: {
  team_member_id: string
  type: string
  title: string
  message: string
  link: string
  related_task_id: string
  email?: string
  name?: string
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
      is_read: false,
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
    throw new Error('Failed to send email')
  }

  return response.json()
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