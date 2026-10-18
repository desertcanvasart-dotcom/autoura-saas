import { describe, it, expect } from 'vitest'
import { recentReminderSentAt, nextReminderAfter, REMINDER_MIN_GAP_DAYS } from '@/lib/invoice-reminder-guard'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// A reminder whose next date failed to save was sent again the next day.

function logDb(rows: Array<{ invoice_id: string; status: string; sent_at: string }>, fail = false) {
  return {
    from: () => {
      let r = [...rows]
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: string) => { r = r.filter(x => (x as Record<string, string>)[c] === v); return q }
      q.gte = (c: string, v: string) => { r = r.filter(x => (x as Record<string, string>)[c] >= v); return q }
      q.order = () => q
      q.limit = async () => (fail ? { data: null, error: { message: 'down' } } : { data: r, error: null })
      return q
    },
  }
}

const NOW = new Date('2026-10-15T09:00:00Z')

describe('recentReminderSentAt', () => {
  it('finds a reminder sent within the gap', async () => {
    const db = logDb([{ invoice_id: 'i1', status: 'sent', sent_at: '2026-10-14T09:00:00Z' }])
    expect(await recentReminderSentAt(db, 'i1', NOW)).toBe('2026-10-14T09:00:00Z')
  })
  it('ignores older, failed, and other invoices’ reminders', async () => {
    const old = new Date(NOW.getTime() - (REMINDER_MIN_GAP_DAYS + 1) * 86_400_000).toISOString()
    const db = logDb([
      { invoice_id: 'i1', status: 'sent', sent_at: old },
      { invoice_id: 'i1', status: 'failed', sent_at: '2026-10-14T09:00:00Z' },
      { invoice_id: 'i2', status: 'sent', sent_at: '2026-10-14T09:00:00Z' },
    ])
    expect(await recentReminderSentAt(db, 'i1', NOW)).toBeNull()
  })
  it('does not stop reminders when the log cannot be read', async () => {
    expect(await recentReminderSentAt(logDb([], true), 'i1', NOW)).toBeNull()
  })
})

describe('nextReminderAfter', () => {
  it('is a week after the sent reminder', () => {
    expect(nextReminderAfter('2026-10-14T09:00:00Z')).toBe('2026-10-21')
  })
})

describe('the automatic reminder runs', () => {
  const root = path.join(__dirname, '..', '..')
  for (const f of ['app/api/cron/send-reminders/route.ts', 'app/api/invoices/reminders/route.ts']) {
    it(`${f} checks the log before sending`, () => {
      const src = readFileSync(path.join(root, f), 'utf8')
      expect(src.indexOf('recentReminderSentAt(')).toBeGreaterThan(-1)
      expect(src.indexOf('recentReminderSentAt(')).toBeLessThan(src.indexOf('generateReminderEmail(invoice, reminderType'))
    })
  }
})
