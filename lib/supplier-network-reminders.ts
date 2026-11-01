// ============================================
// Reminding network suppliers to send their papers (pure rules)
// ============================================
// Operator, 2026-11-01. Being found in the network needs the tick box AND the
// Autoura team's check of the papers (10-30 decision). Suppliers who ticked
// but never sent anything get an email: first 2 days after their last
// change, then weekly, three emails at most. A supplier who sends, unticks or
// is checked drops out on their own (the job reads only listed, unverified
// profiles).

export const REMIND_AFTER_DAYS = 2
export const REMIND_EVERY_DAYS = 7
export const MAX_REMINDERS = 3

const DAY = 86_400_000

export interface ReminderProfile {
  listed: boolean | null
  verification_status: string | null
  updated_at: string
  papers_reminded_at: string | null
  papers_reminder_count: number | null
}

/** Is a reminder due for this profile now? */
export function reminderDue(p: ReminderProfile, now: Date): boolean {
  if (p.listed !== true || p.verification_status !== 'unverified') return false
  if ((p.papers_reminder_count ?? 0) >= MAX_REMINDERS) return false
  if (now.getTime() - new Date(p.updated_at).getTime() < REMIND_AFTER_DAYS * DAY) return false
  if (p.papers_reminded_at && now.getTime() - new Date(p.papers_reminded_at).getTime() < REMIND_EVERY_DAYS * DAY) return false
  return true
}

/** The email: what is missing, in two steps, and where to sign in. */
export function reminderEmail(name: string, papers: number, signInUrl: string): { subject: string; text: string } {
  const first = name.trim().split(/\s+/)[0] || 'there'
  const steps = papers > 0
    ? ['Your papers are uploaded — one step left:', '1. Sign in and press "Send for checking".']
    : ['Two steps left:', '1. Sign in and upload your licence or vehicle papers (a PDF or a photo).', '2. Press "Send for checking".']
  return {
    subject: 'Finish joining the Autoura network',
    text: [
      `Hello ${first},`,
      '',
      'You asked to be found by agencies on the Autoura network, but they cannot find you yet: the Autoura team first checks your papers.',
      '',
      ...steps,
      '',
      `Sign in with your phone number: ${signInUrl}`,
      '',
      'Changed your mind? Untick "Let agencies find me" on your page and we will stop these emails.',
    ].join('\n'),
  }
}
