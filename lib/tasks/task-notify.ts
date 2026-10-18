// ============================================
// Telling people about their tasks
// ============================================
// Settings → Notifications has "Task Assigned — when a task is assigned to
// you" and "Task Completed — when a task you created is completed". Only the
// itinerary task generator ever sent Task Assigned, and nothing sent Task
// Completed (tasks did not record their creator — migration 418). Now:
//
//   * completing a task tells whoever created it, never the person who
//     completed it themselves;
//   * assigning one is announced by the Tasks page (/api/notifications) and
//     the itinerary task generator, both through createNotification.
//
// createNotification applies each recipient's switches (the event, email,
// in-app) to all of them.

import { createAdminClient } from '@/lib/supabase-server'
import { createNotification } from '@/lib/notifications'

interface TaskRef {
  id: string
  title: string | null
}

/** The task's creator hears it is done — unless they completed it themselves. */
export async function notifyTaskCompleted(
  tenantId: string,
  task: TaskRef & { created_by?: string | null },
  completedBy: { id: string; email?: string | null; name?: string | null },
): Promise<void> {
  const creator = task.created_by
  if (!creator || creator === completedBy.id) return
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin.from('user_profiles').select('email').eq('id', creator).maybeSingle()
    if (!profile?.email) return
    const { data: member } = await admin
      .from('team_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', profile.email)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!member) return
    await createNotification({
      team_member_id: member.id,
      type: 'task_completed',
      title: `Task completed: ${task.title || 'Untitled task'}`,
      message: `"${task.title || 'Untitled task'}" was completed${completedBy.name || completedBy.email ? ` by ${completedBy.name || completedBy.email}` : ''}.`,
      link: '/tasks',
      related_task_id: task.id,
      send_email: true,
    })
  } catch (err) {
    console.error('notifyTaskCompleted failed:', err)
  }
}
