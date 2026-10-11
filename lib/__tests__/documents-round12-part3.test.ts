import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { todayInTimeZone, shiftDateISO, monthBounds } from '@/lib/today'
import { resolveTimeZone, tenantTimeZone, tenantToday } from '@/lib/tenant-today'
import { daysOverdueOn, REMINDABLE_INVOICE_STATUSES, reminderBlocker } from '@/lib/invoice-dates'
import { taskReminderKind, reminderChannels, daysOverdue } from '@/lib/tasks/task-reminders'

// ============================================
// Documents audit, round 12 — part 3: reminders, scheduled jobs and dates
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
// 23:30 UTC on 9 October = 08:30 on 10 October in Tokyo.
const TOKYO_MORNING = new Date('2026-10-09T23:30:00Z')

describe("a company's today", () => {
  const env = process.env.BUSINESS_TIMEZONE
  afterEach(() => { process.env.BUSINESS_TIMEZONE = env })

  it('is its own calendar day, not the UTC server’s', () => {
    expect(todayInTimeZone('Asia/Tokyo', TOKYO_MORNING)).toBe('2026-10-10')
    expect(todayInTimeZone('UTC', TOKYO_MORNING)).toBe('2026-10-09')
    expect(todayInTimeZone(null, TOKYO_MORNING)).toBe('2026-10-09')
    expect(todayInTimeZone('Not/AZone', TOKYO_MORNING)).toBe('2026-10-09')
  })

  it('falls back to the platform default, then UTC', () => {
    delete process.env.BUSINESS_TIMEZONE
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(resolveTimeZone('')).toBe('UTC')
    process.env.BUSINESS_TIMEZONE = 'Africa/Cairo'
    expect(resolveTimeZone(null)).toBe('Africa/Cairo')
  })

  it('is read from the tenant row, and never throws', async () => {
    delete process.env.BUSINESS_TIMEZONE
    const db = (tz: string | null) => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: tz }, error: null }) }) }) }),
    })
    expect(await tenantTimeZone(db('Asia/Tokyo'), 't1')).toBe('Asia/Tokyo')
    expect(await tenantToday(db('Asia/Tokyo'), 't1', TOKYO_MORNING)).toBe('2026-10-10')
    expect(await tenantTimeZone({ from: () => { throw new Error('down') } }, 't1')).toBe('UTC')
    expect(await tenantTimeZone(db(null), null)).toBe('UTC')
  })

  it('moves by calendar days', () => {
    expect(shiftDateISO('2026-10-10', 14)).toBe('2026-10-24')
    expect(shiftDateISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(monthBounds('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('can be set in Settings → Organization', () => {
    const page = src('app/settings/tenant/page.tsx')
    expect(page).toContain('Company timezone')
    expect(page).toContain('timezone: companyTimezone || null')
  })
})

describe('invoice reminders', () => {
  it('a part-paid invoice is chased', () => {
    expect(REMINDABLE_INVOICE_STATUSES).toContain('partially_paid')
    expect(reminderBlocker({ status: 'partially_paid', due_date: '2026-10-01' })).toBeNull()
  })

  it('paused invoices stay listed, marked, so they can be resumed', () => {
    const r = src('app/api/invoices/reminders/route.ts')
    const get = r.slice(r.indexOf('export async function GET'), r.indexOf('export async function POST'))
    expect(get).not.toContain(".eq('reminder_paused', false)")
    expect(get).toContain('reminder_paused.eq.true')
    expect(get).toContain("reminder_paused: invoice.reminder_paused === true")
    const post = r.slice(r.indexOf('export async function POST'))
    expect(post).toContain(".eq('reminder_paused', false)")
  })

  it('days overdue counts the company’s calendar', () => {
    expect(daysOverdueOn('2026-10-01', '2026-10-10')).toBe(9)
    expect(daysOverdueOn('2026-10-17', '2026-10-10')).toBe(-7)
    expect(daysOverdueOn(null, '2026-10-10')).toBeNull()
  })

  it('a failed send is retried tomorrow, behind those that waited longer', () => {
    const cron = src('app/api/cron/send-reminders/route.ts')
    expect(cron).toContain(".order('next_reminder_date', { ascending: true, nullsFirst: true })")
    expect(cron).not.toContain(".order('due_date'")
    const failBranch = cron.slice(cron.indexOf('} else {', cron.indexOf('if (result.success)')))
    expect(failBranch).toContain('next_reminder_date: shiftDateISO(today, 1)')
  })

  it('a reminder too early is parked a week before its due date', () => {
    expect(src('app/api/cron/send-reminders/route.ts')).toContain("next_reminder_date: shiftDateISO(String(invoice.due_date).slice(0, 10), -7)")
  })
})

describe('task reminders', () => {
  it('due tomorrow and overdue on the company’s day', () => {
    expect(taskReminderKind('2026-10-11', '2026-10-10')).toBe('task_due_soon')
    expect(taskReminderKind('2026-10-09', '2026-10-10')).toBe('task_overdue')
    expect(taskReminderKind('2026-10-10', '2026-10-10')).toBeNull()
    expect(taskReminderKind('2026-10-20', '2026-10-10')).toBeNull()
    expect(taskReminderKind(null, '2026-10-10')).toBeNull()
    expect(daysOverdue('2026-10-07', '2026-10-10')).toBe(3)
  })

  it('follow the person’s notification settings', () => {
    expect(reminderChannels(null, 'task_overdue')).toEqual({ remind: true, email: true, inApp: true })
    expect(reminderChannels({ task_overdue: false }, 'task_overdue').remind).toBe(false)
    expect(reminderChannels({ task_overdue: false }, 'task_due_soon').remind).toBe(true)
    expect(reminderChannels({ email_enabled: false }, 'task_due_soon')).toEqual({ remind: true, email: false, inApp: true })
    expect(reminderChannels({ email_enabled: false, in_app_enabled: false }, 'task_due_soon').remind).toBe(false)
  })

  it('skip archived tasks and deactivated members', () => {
    const cron = src('app/api/cron/task-reminders/route.ts')
    expect(cron).toContain(".or('archived.eq.false,archived.is.null')")
    expect(cron).toContain('member.is_active === false')
    expect(cron).toContain("from('user_settings')")
  })
})

describe('dates the system writes', () => {
  it('{{today}} and the deposit date use the company’s day', () => {
    const r = src('app/api/clients/[id]/template-data/route.ts')
    expect(r).toContain('today: todayInTimeZone(resolveTimeZone(terms?.timezone))')
    expect(r).not.toContain('data.today = formatDate(new Date())')
  })

  it('bookings are dated, and their deadlines set, on the company’s day', () => {
    for (const f of ['lib/bookings/create-booking-on-confirm.ts', 'app/api/bookings/from-quote/route.ts']) {
      const r = src(f)
      expect(r, f).toContain('booking_date: today')
      expect(r, f).toMatch(/payment_deadline: shiftDateISO\(today, \w+\.depositDueDays\)/)
    }
  })

  it('14-day due dates and the tour date count from the user’s own day', () => {
    for (const f of ['app/itineraries/[id]/page.tsx', 'app/itineraries/[id]/edit/page.tsx', 'app/invoices/invoices-content.tsx', 'app/tours/[code]/page.tsx']) {
      const r = src(f)
      expect(r, f).toContain('shiftDateISO(todayLocal(), 14)')
      expect(r, f).not.toContain('14 * 24 * 60 * 60 * 1000')
    }
  })

  it('departures: a cutoff of 0 is 0, and today is the company’s', () => {
    const check = src('app/api/departures/check/route.ts')
    expect(check).toContain('dep.cutoff_days ?? 3')
    expect(check).not.toContain('dep.cutoff_days || 3')
    expect(check).toContain('await tenantToday(supabase, tenant_id)')
    expect(src('app/api/departures/route.ts')).toContain('await tenantToday(supabase, tenant_id)')
  })
})
