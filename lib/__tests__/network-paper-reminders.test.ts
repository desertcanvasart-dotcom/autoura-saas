import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { reminderDue, reminderEmail, MAX_REMINDERS, type ReminderProfile } from '@/lib/supplier-network-reminders'

// Operator, 2026-11-01: suppliers who ticked "Let agencies find me" but never
// sent their papers get an email — 2 days after their last change, then
// weekly, three at most.

const NOW = new Date('2026-11-10T06:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const p = (over: Partial<ReminderProfile> = {}): ReminderProfile => ({
  listed: true, verification_status: 'unverified', updated_at: daysAgo(3), papers_reminded_at: null, papers_reminder_count: 0, ...over,
})

describe('who is reminded', () => {
  it('a listed, unverified profile untouched for 2 days', () => {
    expect(reminderDue(p(), NOW)).toBe(true)
    expect(reminderDue(p({ updated_at: daysAgo(1) }), NOW)).toBe(false)
  })

  it('never one who sent, was checked, or unticked the box', () => {
    for (const status of ['pending', 'verified', 'rejected']) expect(reminderDue(p({ verification_status: status }), NOW)).toBe(false)
    expect(reminderDue(p({ listed: false }), NOW)).toBe(false)
  })

  it('once a week, three times at most', () => {
    expect(reminderDue(p({ papers_reminded_at: daysAgo(3), papers_reminder_count: 1 }), NOW)).toBe(false)
    expect(reminderDue(p({ papers_reminded_at: daysAgo(8), papers_reminder_count: 1 }), NOW)).toBe(true)
    expect(reminderDue(p({ papers_reminded_at: daysAgo(30), papers_reminder_count: MAX_REMINDERS }), NOW)).toBe(false)
  })
})

describe('the email', () => {
  it('says what is missing and where to sign in', () => {
    const none = reminderEmail('Nile Cars Co', 0, 'https://x/supplier-login')
    expect(none.text.startsWith('Hello Nile,')).toBe(true)
    expect(none.text).toContain('upload your licence or vehicle papers')
    expect(none.text).toContain('https://x/supplier-login')
    const some = reminderEmail('Nile', 2, 'https://x/supplier-login')
    expect(some.text).toContain('Your papers are uploaded')
    expect(some.text).not.toContain('upload your licence')
  })

  it('tells them how to stop it', () => {
    expect(reminderEmail('A', 0, 'u').text).toContain('Untick "Let agencies find me"')
  })
})

describe('the job', () => {
  const route = readFileSync('app/api/cron/network-paper-reminders/route.ts', 'utf8')

  it('is cron-only and recorded as a job run', () => {
    expect(route).toContain("bearerMatches(request.headers.get('authorization'), CRON_SECRET)")
    expect(route).toContain("withJobRun('network-paper-reminders'")
  })

  it('emails only addresses on records of agencies that confirmed the supplier', () => {
    expect(route).toContain(".eq('status', 'approved')")
    expect(route).toContain('codeEmails(')
  })

  it('records the reminder only when an email went out', () => {
    expect(route).toMatch(/if \(sent === 0\) continue[\s\S]*papers_reminder_count: \(p\.papers_reminder_count \?\? 0\) \+ 1/)
  })

  it('runs daily from the reminders service', () => {
    expect(readFileSync('scripts/cron-reminders.mjs', 'utf8')).toContain("'/api/cron/network-paper-reminders'")
  })
})
