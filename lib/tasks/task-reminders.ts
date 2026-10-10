// ============================================
// Which task reminder, if any, and through which channel
// ============================================
// Pure: the task-reminders job and the tests share it (documents audit,
// round 12). The job reminded:
//   - on the server's UTC day, so "due tomorrow" and "overdue" were a day
//     behind in Japan every morning — now the company's own day;
//   - about archived tasks and to deactivated team members;
//   - whatever the person had switched off in Settings → Notifications (the
//     settings were saved and never read).

import { shiftDateISO } from '@/lib/today'

export type TaskReminderKind = 'task_due_soon' | 'task_overdue'

/** The reminder a task gets on `today` (YYYY-MM-DD), or null. */
export function taskReminderKind(dueDate: string | null | undefined, today: string): TaskReminderKind | null {
  if (!dueDate) return null
  const due = String(dueDate).slice(0, 10)
  if (due === shiftDateISO(today, 1)) return 'task_due_soon'
  if (due < today) return 'task_overdue'
  return null
}

/** Whole days a task is overdue on `today`. */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

export interface NotificationPreferences {
  task_due_soon?: boolean
  task_overdue?: boolean
  email_enabled?: boolean
  in_app_enabled?: boolean
  [key: string]: unknown
}

export interface ReminderChannels {
  /** Remind at all. */
  remind: boolean
  email: boolean
  inApp: boolean
}

/** What a person's settings allow for this reminder. No settings saved: the
 *  defaults (both on), as Settings → Notifications shows them. */
export function reminderChannels(prefs: NotificationPreferences | null | undefined, kind: TaskReminderKind): ReminderChannels {
  const p = prefs ?? {}
  const email = p.email_enabled !== false
  const inApp = p.in_app_enabled !== false
  const remind = p[kind] !== false && (email || inApp)
  return { remind, email: remind && email, inApp: remind && inApp }
}
