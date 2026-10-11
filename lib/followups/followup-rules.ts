// ============================================
// Follow-ups: their type and their day
// ============================================
// client_followups has no type column: the form writes the type as a label
// prefix of the description ("Phone Call - <client>"). The dashboard read it
// back; the edit form did not, so editing any follow-up made it a Phone Call.
//
// due_date is a TIMESTAMPTZ written from a date ("2026-10-11"), so it comes
// back as UTC midnight. Parsed with new Date() it became the day before west
// of UTC (flagged overdue a day early), and a "2026-10-11T00:00:00+00:00"
// value left the edit form's date box empty. The day is its first ten
// characters, compared with the user's own today.
//
// Pure: the dashboard, the client page, the form and the tests share it.

import { shiftDateISO } from '@/lib/today'

export const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  call: 'Phone Call',
  email: 'Email',
  whatsapp: 'WhatsApp Message',
  meeting: 'Meeting',
  quote: 'Send Quote',
  booking_confirmation: 'Booking Confirmation',
  payment_reminder: 'Payment Reminder',
  feedback: 'Request Feedback',
  other: 'Follow-up',
}

/** The type a follow-up was saved with, from its description's prefix. */
export function followupTypeOf(description: string | null | undefined): string {
  const label = String(description ?? '').split(' - ')[0]
  const found = Object.entries(FOLLOWUP_TYPE_LABELS).find(([, l]) => l === label)
  return found ? found[0] : 'other'
}

export function followupTitle(type: string, clientName: string): string {
  return `${FOLLOWUP_TYPE_LABELS[type] || 'Follow-up'} - ${clientName}`
}

/** "YYYY-MM-DD" of a stored due date. */
export function dueDay(due: string | null | undefined): string {
  return String(due ?? '').slice(0, 10)
}

export type DueBucket = 'overdue' | 'today' | 'later'

export function dueBucket(due: string | null | undefined, today: string): DueBucket {
  const day = dueDay(due)
  if (!day) return 'later'
  return day < today ? 'overdue' : day === today ? 'today' : 'later'
}

/** Due today or within the next seven days. */
export function dueThisWeek(due: string | null | undefined, today: string): boolean {
  const day = dueDay(due)
  return !!day && day >= today && day <= shiftDateISO(today, 7)
}

/** "Mon, Oct 12" for a stored due date, on its own day in any timezone. */
export function formatDueDay(due: string | null | undefined): string {
  const day = dueDay(due)
  if (!day) return ''
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
