import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  REMINDER_DUE, REMINDER_SENT, expiredBell, isOverdue, lineLink, pickNextSupplier, reminderAt, reminderBell, reminderDue, remindedSince,
} from '@/lib/bookings/service-booking-deadlines'

const asked = (over: Partial<{ status: string; requested_at: string; reply_deadline: string }> = {}) => ({
  id: 'l1',
  status: 'requested',
  requested_at: '2026-11-01T08:00:00Z',
  reply_deadline: '2026-11-01T12:00:00Z', // 4 h
  ...over,
})
const at = (iso: string) => new Date(iso)

describe('reply deadlines — when to nudge, when to hand back', () => {
  it('nudges halfway: 2 h into a 4 h window, 30 min into a 1 h one', () => {
    expect(reminderAt(asked())?.toISOString()).toBe('2026-11-01T10:00:00.000Z')
    expect(reminderAt(asked({ reply_deadline: '2026-11-01T09:00:00Z' }))?.toISOString()).toBe('2026-11-01T08:30:00.000Z')
    expect(reminderDue(asked(), at('2026-11-01T09:59:00Z'), false)).toBe(false)
    expect(reminderDue(asked(), at('2026-11-01T10:00:00Z'), false)).toBe(true)
  })

  it('nudges once: not again after the job nudged or the office reminded', () => {
    expect(reminderDue(asked(), at('2026-11-01T11:00:00Z'), true)).toBe(false)
  })

  it('past the deadline is a hand-back, not a nudge', () => {
    expect(isOverdue(asked(), at('2026-11-01T12:00:00Z'))).toBe(true)
    expect(isOverdue(asked(), at('2026-11-01T11:59:00Z'))).toBe(false)
    expect(reminderDue(asked(), at('2026-11-01T12:05:00Z'), false)).toBe(false)
  })

  it('only a line still waiting counts', () => {
    for (const status of ['accepted', 'assigned', 'declined', 'expired', 'cancelled', 'pending']) {
      expect(isOverdue(asked({ status }), at('2026-11-02T00:00:00Z'))).toBe(false)
      expect(reminderDue(asked({ status }), at('2026-11-01T11:00:00Z'), false)).toBe(false)
    }
  })

  it('a line with no deadline is never handed back', () => {
    expect(isOverdue({ id: 'x', status: 'requested', requested_at: null, reply_deadline: null }, at('2030-01-01T00:00:00Z'))).toBe(false)
    expect(reminderAt({ id: 'x', status: 'requested', requested_at: null, reply_deadline: '2026-11-01T12:00:00Z' })).toBeNull()
  })

  it('a reminder counts only for this line and since it was (re)asked', () => {
    const events = [
      { service_booking_id: 'l1', occurred_at: '2026-10-31T09:00:00Z', details: { kind: REMINDER_DUE } }, // an earlier ask
      { service_booking_id: 'l2', occurred_at: '2026-11-01T09:00:00Z', details: { kind: REMINDER_SENT } }, // another line
      { service_booking_id: 'l1', occurred_at: '2026-11-01T09:00:00Z', details: {} }, // some other event
    ]
    expect(remindedSince(events, 'l1', '2026-11-01T08:00:00Z')).toBe(false)
    expect(remindedSince([...events, { service_booking_id: 'l1', occurred_at: '2026-11-01T09:30:00Z', details: { kind: REMINDER_SENT } }], 'l1', '2026-11-01T08:00:00Z')).toBe(true)
  })
})

describe('the next supplier to try', () => {
  const opts = [
    { supplier_id: 'a', name: 'Aswan Cars', cost: 50 },
    { supplier_id: 'b', name: 'Blue Nile', cost: 40 },
    { supplier_id: 'c', name: 'Cairo Guides', cost: null },
    { supplier_id: 'd', name: 'Delta', cost: 70, preferred: true },
  ]

  it('never the one who did not answer; starred first, then cheapest known cost', () => {
    expect(pickNextSupplier(opts, 'd')?.supplier_id).toBe('b')
    expect(pickNextSupplier(opts, 'b')?.supplier_id).toBe('d')
    expect(pickNextSupplier(opts.slice(0, 3), 'b')?.supplier_id).toBe('a')
  })

  it('a supplier with no rate comes after every priced one', () => {
    expect(pickNextSupplier([opts[2], opts[0]], null)?.supplier_id).toBe('a')
  })

  it('nobody else = none', () => {
    expect(pickNextSupplier([opts[0]], 'a')).toBeNull()
    expect(pickNextSupplier([], null)).toBeNull()
  })
})

describe('bell wording', () => {
  const line = { supplier_name: 'Blue Nile', service_description: 'Airport pickup', supplier_type: 'transport', reply_deadline: '2026-11-01T12:00:00Z' }

  it('the nudge says how long is left', () => {
    const b = reminderBell(line, at('2026-11-01T10:00:00Z'))
    expect(b.title).toBe('Blue Nile has not answered yet')
    expect(b.message).toContain('2 h left')
    expect(reminderBell(line, at('2026-11-01T11:35:00Z')).message).toContain('25 min left')
  })

  it('the hand-back names the next supplier and their cost, or says there is no rate — never a made-up price', () => {
    expect(expiredBell(line, { supplier_id: 'a', name: 'Aswan Cars', cost: 50 }, 'EGP').message).toContain('Next to try: Aswan Cars (EGP 50.00)')
    expect(expiredBell(line, { supplier_id: 'c', name: 'Cairo', cost: null }, 'EGP').message).toContain('(no rate — agree the price)')
    expect(expiredBell(line, null, 'EGP').message).toContain('Choose who covers it.')
  })

  it('opens the booking on the Suppliers tab, on that line', () => {
    expect(lineLink('b1', 'l1')).toBe('/bookings/b1?tab=suppliers&line=l1')
  })
})

describe('the job tells the office only', () => {
  const src = readFileSync('app/api/cron/service-booking-deadlines/route.ts', 'utf8')

  it('moves status only through the one writer, and only to No reply', () => {
    expect(src).not.toMatch(/\.update\(/)
    expect(src).toContain("to: 'expired'")
    expect(src).toContain('transitionServiceBooking')
  })

  it('never messages a supplier', () => {
    expect(src).not.toMatch(/whatsapp|resend|sendEmail|twilio/i)
  })

  it('the office reminder is logged so the job does not nudge after it', () => {
    expect(readFileSync('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts', 'utf8')).toContain('kind: REMINDER_SENT')
  })

  it('the 5-minute cron calls it', () => {
    expect(readFileSync('scripts/cron-mail-alerts.mjs', 'utf8')).toContain('/api/cron/service-booking-deadlines')
  })
})
