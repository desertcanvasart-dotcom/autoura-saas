import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { dueBucket, dueDay, dueThisWeek, followupTitle, followupTypeOf, formatDueDay } from '@/lib/followups/followup-rules'
import { autoReminderType, daysOverdueOn, isFirstReminderDue } from '@/lib/invoice-dates'
import { reopenRefusal, type ChecklistItem } from '@/lib/tasks/itinerary-tasks'
import { attractionUnitRate, withPickedAttractions } from '@/lib/documents/voucher-lines'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

// Operate-group medium bugs, 2026-10-11.
describe('follow-ups', () => {
  it('editing keeps the type it was saved with', () => {
    expect(followupTypeOf(followupTitle('quote', 'Ana Silva'))).toBe('quote')
    expect(followupTypeOf('Follow-up - Ana')).toBe('other')
    expect(followupTypeOf(null)).toBe('other')
    expect(src('components/AddFollowupModal.tsx')).toContain('followup_type: followupTypeOf(editFollowup.description),')
  })

  it('the stored timestamp fills the date box, and its day does not move by timezone', () => {
    expect(dueDay('2026-10-11T00:00:00+00:00')).toBe('2026-10-11')
    expect(src('components/AddFollowupModal.tsx')).toContain('due_date: dueDay(editFollowup.due_date),')
    expect(formatDueDay('2026-10-11T00:00:00+00:00')).toContain('11')
  })

  it('today is today, not overdue; the week is today to seven days on', () => {
    const today = '2026-10-11'
    expect(dueBucket('2026-10-11T00:00:00+00:00', today)).toBe('today')
    expect(dueBucket('2026-10-10T00:00:00+00:00', today)).toBe('overdue')
    expect(dueBucket('2026-10-12', today)).toBe('later')
    expect(dueThisWeek('2026-10-11', today)).toBe(true)
    expect(dueThisWeek('2026-10-18', today)).toBe(true)
    expect(dueThisWeek('2026-10-19', today)).toBe(false)
    expect(src('app/clients/[id]/page.tsx')).toContain("dueBucket(f.due_date, todayLocal()) === 'overdue'")
  })

  it('a delete that removed nothing says so', () => {
    expect(src('app/followups/page.tsx')).toContain("showToast('error', 'Only managers and admins can delete follow-ups')")
    expect(src('components/AddFollowupModal.tsx')).toContain("throw new Error('Only managers and admins can delete follow-ups')")
  })
})

describe('payment reminders', () => {
  it('the list and the daily job use one ladder and the company’s calendar', () => {
    expect(autoReminderType(-10)).toBe('before_due_7')
    expect(autoReminderType(0)).toBe('on_due')
    expect(autoReminderType(5)).toBe('overdue_14')
    expect(autoReminderType(40)).toBe('overdue_30')
    expect(daysOverdueOn('2026-10-11', '2026-10-11')).toBe(0)
    expect(src('app/api/cron/send-reminders/route.ts')).toContain('const reminderType = autoReminderType(daysOverdue)')
  })

  it('an invoice never reminded is listed from a week before it is due', () => {
    expect(isFirstReminderDue(null, -30)).toBe(false)
    expect(isFirstReminderDue(null, -7)).toBe(true)
    expect(src('app/api/invoices/reminders/route.ts')).toContain('isFirstReminderDue(invoice.next_reminder_date, daysOverdue)')
  })

  it('Load More fetches the next rows; counts are counts', () => {
    expect(src('app/reminders/page.tsx')).toContain('fetchReminderHistory(false, reminderHistory.length)')
    expect(src('app/api/reminders/history/route.ts')).toContain("countOf('sent'), countOf('failed')")
  })
})

describe('capacity and the WhatsApp AI', () => {
  it('a Busy date is not offered, and a full one is busy whatever its status', () => {
    const agent = src('lib/whatsapp-ai-agent.ts')
    expect(agent).toContain("return cap.status === 'busy' || (cap.status !== 'blackout' && full)")
    expect(src('app/settings/capacity/page.tsx')).not.toContain('AI may suggest alternatives')
  })
})

describe('operations tasks', () => {
  const row = (booked: boolean) => ({ key: Math.random().toString(), booked, confirmation: null, booked_at: null } as unknown as ChecklistItem)
  it('a fully booked task cannot be reopened by status; unticking a booking reopens it', () => {
    expect(reopenRefusal([row(true), row(true)])).toContain('untick the booking to redo')
    expect(reopenRefusal([row(true), row(false)])).toBeNull()
    expect(src('app/api/tasks/[id]/route.ts')).toContain('reopenRefusal(current.checklist')
  })
})

describe('departures', () => {
  it('every departure has its status menu, Full and Cancelled included', () => {
    expect(src('app/departures/page.tsx')).not.toContain("departure.status !== 'cancelled' && departure.status !== 'full' && (")
  })
})

describe('supplier documents', () => {
  it('WhatsApp sends the PDF from the company’s number, with a working fallback link', () => {
    const page = src('app/documents/supplier/[id]/page.tsx')
    expect(page).toContain("fetch('/api/whatsapp/send-supplier-document'")
    expect(page).toContain('formatPhoneForWhatsApp(document.supplier_contact_phone, tenant?.operating_country)')
    expect(src('app/api/whatsapp/send-supplier-document/route.ts')).toContain("gateRole('staff')")
  })

  it('an entrance fee is priced for the passport, in the voucher’s currency', () => {
    const rates = [{ base_currency: 'EGP', target_currency: 'USD', rate: 0.02, is_active: true }] as never
    const fee = { eur_rate: 500, non_eur_rate: 900, rate_currency: 'EGP' }
    expect(attractionUnitRate(fee, { euPassport: false, runCurrency: 'EUR', documentCurrency: 'USD', rates })).toBe(18)
    expect(attractionUnitRate(fee, { euPassport: true, runCurrency: 'EUR', documentCurrency: 'USD', rates })).toBe(10)
    expect(attractionUnitRate(fee, { euPassport: false, runCurrency: 'EUR', documentCurrency: 'GBP', rates: [] })).toBeNull()
    const [line] = withPickedAttractions([], [{ attraction_name: 'Karnak', eur_rate: 500, unit_rate: 18, quantity: 2 }])
    expect(line).toMatchObject({ unit_rate: 18, total_cost: 36 })
  })
})
