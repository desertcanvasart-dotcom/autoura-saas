import { describe, it, expect } from 'vitest'
import {
  canTransition, isCovered, isCancelled, normalizeStatus, replyDeadline, STORED_STATUSES,
} from '@/lib/bookings/service-booking-states'
import { supplierBacking } from '@/lib/bookings/booking-suppliers'
import { planSupplierExpense } from '@/lib/bookings/supplier-expense'
import { eventRow } from '@/lib/bookings/service-booking-events'

describe('service booking states', () => {
  it('reads the old words as the new states', () => {
    expect(normalizeStatus('contacted')).toBe('requested')
    expect(normalizeStatus('confirmed')).toBe('accepted')
    expect(normalizeStatus('no_response')).toBe('expired')
    expect(normalizeStatus('assigned')).toBe('assigned')
    expect(normalizeStatus(null)).toBe('pending')
    expect(normalizeStatus('???')).toBe('pending')
  })

  it('covered = accepted, assigned or done (what "confirmed" meant)', () => {
    for (const s of ['confirmed', 'accepted', 'assigned', 'done']) expect(isCovered(s), s).toBe(true)
    for (const s of ['pending', 'requested', 'contacted', 'declined', 'expired', 'no_response', 'cancelled']) expect(isCovered(s), s).toBe(false)
    expect(isCancelled('cancelled')).toBe(true)
  })

  it('the database list is exactly the new states plus the three old words (446)', () => {
    expect([...STORED_STATUSES].sort()).toEqual([
      'accepted', 'assigned', 'cancelled', 'confirmed', 'contacted', 'declined', 'done', 'expired', 'no_response', 'pending', 'requested',
    ])
  })

  it('follows the request path', () => {
    expect(canTransition('pending', 'requested').ok).toBe(true)
    expect(canTransition('requested', 'accepted').ok).toBe(true)
    expect(canTransition('accepted', 'assigned').ok).toBe(true)
    expect(canTransition('assigned', 'done').ok).toBe(true)
    expect(canTransition('requested', 'declined').ok).toBe(true)
    expect(canTransition('requested', 'expired').ok).toBe(true)
    expect(canTransition('contacted', 'accepted').ok, 'old word in, new word out').toBe(true)
  })

  it('a late answer still counts; a done line stays done', () => {
    expect(canTransition('expired', 'accepted').ok).toBe(true)
    expect(canTransition('done', 'cancelled').ok).toBe(false)
    expect(canTransition('pending', 'done').ok).toBe(false)
    expect(canTransition('cancelled', 'accepted').ok).toBe(false)
    expect(canTransition('cancelled', 'pending').ok).toBe(true)
    expect(canTransition('accepted', 'accepted').ok).toBe(false)
  })

  it('own cars, guides and staff are assigned, never requested', () => {
    expect(canTransition('pending', 'assigned', 'own').ok).toBe(true)
    const asked = canTransition('pending', 'requested', 'own')
    expect(asked.ok).toBe(false)
    if (!asked.ok) expect(asked.reason).toMatch(/assigned directly/)
  })
})

describe('reply deadline (operator, 2026-10-30): 4 h, or 1 h within 48 h', () => {
  const sent = new Date('2026-11-01T10:00:00Z')
  const hoursAfter = (d: Date) => (d.getTime() - sent.getTime()) / 3_600_000

  it('4 hours when the service is further off, or has no date', () => {
    expect(hoursAfter(replyDeadline(sent, new Date('2026-11-05T09:00:00Z')))).toBe(4)
    expect(hoursAfter(replyDeadline(sent, null))).toBe(4)
  })

  it('1 hour when the service is within 48 hours', () => {
    expect(hoursAfter(replyDeadline(sent, new Date('2026-11-03T10:00:00Z')))).toBe(1)
    expect(hoursAfter(replyDeadline(sent, new Date('2026-11-01T18:00:00Z')))).toBe(1)
  })
})

describe('the booking and the expense read the new states', () => {
  it('a booking is backed when every needed line is covered, in old or new words', () => {
    expect(supplierBacking([{ status: 'assigned' }, { status: 'confirmed' }, { status: 'cancelled' }]).backed).toBe(true)
    expect(supplierBacking([{ status: 'assigned' }, { status: 'requested' }]))
      .toEqual({ total: 2, confirmed: 1, backed: false })
  })

  it('an assigned or done line keeps its expense; a declined one has none', () => {
    const row = { status: 'assigned', confirmed_cost: 50, quoted_cost: null, service_date: '2027-01-02' }
    expect(planSupplierExpense(row, null, '2026-10-30')).toEqual({ action: 'create', amount: 50, currency: 'EUR', expense_date: '2027-01-02' })
    expect(planSupplierExpense({ ...row, status: 'done' }, { status: 'pending', amount: 50, expense_date: '2027-01-02', currency: 'EUR' }, '2026-10-30'))
      .toEqual({ action: 'none' })
    expect(planSupplierExpense({ ...row, status: 'declined' }, { status: 'pending', amount: 50, expense_date: '2027-01-02' }, '2026-10-30'))
      .toEqual({ action: 'remove' })
  })
})

describe('event rows', () => {
  it('trims and fills the optional fields', () => {
    expect(eventRow({
      tenantId: 't', bookingId: 'b', serviceBookingId: 's', actor: 'supplier', channel: 'link',
      actorLabel: '  Nile Cars ', toStatus: 'accepted', note: '   ',
    })).toEqual({
      tenant_id: 't', booking_id: 'b', service_booking_id: 's', actor_kind: 'supplier', channel: 'link',
      actor_user_id: null, actor_label: 'Nile Cars', from_status: null, to_status: 'accepted', note: null, details: {},
    })
  })
})
