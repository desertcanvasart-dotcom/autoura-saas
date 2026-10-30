import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { canTransition, isCovered } from '@/lib/bookings/service-booking-states'
import { doneBefore, hasHappened } from '@/lib/bookings/service-booking-done'

const now = new Date('2026-11-05T06:00:00Z')

describe('a covered service that has happened is Done', () => {
  it('accepted (nobody to name) and assigned lines dated before today', () => {
    expect(hasHappened({ status: 'accepted', service_date: '2026-11-04' }, now)).toBe(true)
    expect(hasHappened({ status: 'assigned', service_date: '2026-11-01' }, now)).toBe(true)
  })

  it('not on the day itself, nor later', () => {
    expect(doneBefore(now)).toBe('2026-11-05')
    expect(hasHappened({ status: 'assigned', service_date: '2026-11-05' }, now)).toBe(false)
    expect(hasHappened({ status: 'assigned', service_date: '2026-12-01' }, now)).toBe(false)
  })

  it('never a line nobody covered — that stays for the office to see', () => {
    for (const status of ['pending', 'requested', 'declined', 'expired', 'cancelled', 'done']) {
      expect(hasHappened({ status, service_date: '2026-10-01' }, now), status).toBe(false)
    }
    expect(hasHappened({ status: 'assigned', service_date: null }, now)).toBe(false)
  })

  it('accepted may now become done; done stays covered (the expense is untouched)', () => {
    expect(canTransition('accepted', 'done').ok).toBe(true)
    expect(canTransition('assigned', 'done', 'own').ok).toBe(true)
    expect(isCovered('done')).toBe(true)
  })

  it('the job moves status only through the one writer, quietly', () => {
    const src = readFileSync('app/api/cron/service-booking-done/route.ts', 'utf8')
    expect(src).not.toMatch(/\.update\(/)
    expect(src).toContain("to: 'done'")
    expect(src).not.toContain('notifyTeam')
    expect(readFileSync('scripts/cron-reminders.mjs', 'utf8')).toContain('/api/cron/service-booking-done')
  })
})
