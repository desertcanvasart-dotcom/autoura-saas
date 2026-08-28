import { describe, it, expect } from 'vitest'
import {
  buildAttentionItems,
  passengerComplete,
  type AttentionBooking,
} from '../dashboard/attention'

// C4: the exceptions list. Every rule here decides whether an operator finds
// out about a problem before a group flies, so the tests pin both directions:
// what must appear, and what must NOT (a dashboard that cries wolf gets
// ignored, which is the same as showing nothing).

const TODAY = '2026-09-01'
const booking = (over: Partial<AttentionBooking> = {}): AttentionBooking => ({
  id: 'b1',
  booking_number: 'BKG-1',
  trip_name: 'Nile Discovery',
  client_id: 'c1',
  start_date: '2026-09-20',
  status: 'confirmed',
  itinerary_id: 'i1',
  balance_due: 0,
  payment_deadline: null,
  ...over,
})

const base = {
  departing: [] as AttentionBooking[],
  balanceDue: [] as AttentionBooking[],
  passengers: [],
  changeRequests: [],
  guideByItinerary: new Map<string, string | null>(),
  clientNames: new Map([['c1', 'Rania Haddad']]),
  today: TODAY,
}

describe('balance due', () => {
  it('an overdue balance is urgent and says so', () => {
    const { items } = buildAttentionItems({
      ...base,
      balanceDue: [booking({ balance_due: 1200, payment_deadline: '2026-08-25' })],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'balance_due', severity: 'urgent' })
    expect(items[0].detail).toMatchObject({ balanceDue: 1200, overdue: true })
    expect(items[0].clientName).toBe('Rania Haddad')
    expect(items[0].href).toBe('/bookings/b1')
  })

  it('a deadline inside 14 days is "soon", inside 7 is urgent', () => {
    const soon = buildAttentionItems({
      ...base,
      balanceDue: [booking({ balance_due: 500, payment_deadline: '2026-09-12', start_date: '2026-12-01' })],
    })
    expect(soon.items[0].severity).toBe('soon')

    const urgent = buildAttentionItems({
      ...base,
      balanceDue: [booking({ balance_due: 500, payment_deadline: '2026-09-05', start_date: '2026-12-01' })],
    })
    expect(urgent.items[0].severity).toBe('urgent')
  })

  it('a settled balance never appears, whatever the deadline', () => {
    const { items } = buildAttentionItems({
      ...base,
      balanceDue: [booking({ balance_due: 0, payment_deadline: '2026-08-01' })],
    })
    expect(items).toEqual([])
  })

  it('an imminent departure raises the balance even with no deadline set', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking({ balance_due: 900, payment_deadline: null, start_date: '2026-09-04' })],
    })
    expect(items[0]).toMatchObject({ type: 'balance_due', severity: 'urgent' })
  })
})

describe('traveller details', () => {
  const pax = (over = {}) => ({ booking_id: 'b1', passport_number: 'X1', date_of_birth: '1990-01-01', ...over })

  it('counts a passenger complete only with passport AND date of birth', () => {
    expect(passengerComplete(pax())).toBe(true)
    expect(passengerComplete(pax({ passport_number: null }))).toBe(false)
    expect(passengerComplete(pax({ passport_number: '   ' }))).toBe(false)
    expect(passengerComplete(pax({ date_of_birth: null }))).toBe(false)
  })

  it('flags a departure with some details outstanding, and counts them', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking()],
      passengers: [pax(), pax({ passport_number: null })],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'details_missing', severity: 'soon' })
    expect(items[0].detail).toMatchObject({ complete: 1, total: 2 })
  })

  it('says nothing once every passenger is complete', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking()],
      passengers: [pax(), pax()],
    })
    expect(items).toEqual([])
  })

  it('does not chase details for a booking that is only in the balance window', () => {
    // Its departure is months away; only the payment deadline brought it in.
    const { items } = buildAttentionItems({
      ...base,
      balanceDue: [booking({ balance_due: 100, payment_deadline: '2026-09-10', start_date: '2027-06-01' })],
      passengers: [pax({ passport_number: null })],
    })
    expect(items.map(i => i.type)).toEqual(['balance_due'])
  })
})

describe('guide assignment', () => {
  it('flags an itinerary with no guide', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking()],
      guideByItinerary: new Map([['i1', null]]),
    })
    expect(items[0]).toMatchObject({ type: 'no_guide', href: '/itineraries/i1/edit' })
  })

  it('says nothing when a guide is assigned', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking()],
      guideByItinerary: new Map([['i1', 'g1']]),
    })
    expect(items).toEqual([])
  })

  it('an itinerary that was never looked up is UNKNOWN, not unassigned', () => {
    // The absent-entry case must not raise a false alarm.
    const { items } = buildAttentionItems({ ...base, departing: [booking()] })
    expect(items).toEqual([])
  })
})

describe('change requests and ordering', () => {
  it('a pending request is always urgent — a customer is waiting', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking({ start_date: '2026-10-15' })],
      changeRequests: [{ booking_id: 'b1', kind: 'add_traveller', requested_count: 2, created_at: '2026-08-30' }],
    })
    expect(items[0]).toMatchObject({ type: 'change_request', severity: 'urgent' })
    expect(items[0].detail).toMatchObject({ requestedCount: 2 })
  })

  it('urgent first, then soonest departure — stable across refreshes', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [
        booking({ id: 'far', start_date: '2026-10-10', itinerary_id: 'i-far' }),
        booking({ id: 'near', start_date: '2026-09-03', itinerary_id: 'i-near' }),
      ],
      guideByItinerary: new Map([['i-far', null], ['i-near', null]]),
    })
    expect(items.map(i => [i.bookingId, i.severity])).toEqual([
      ['near', 'urgent'],
      ['far', 'soon'],
    ])
  })

  it('a booking in BOTH windows is scanned once, but can raise several items', () => {
    const b = booking({ balance_due: 700, payment_deadline: '2026-08-20', start_date: '2026-09-10' })
    const { items, scannedBookings } = buildAttentionItems({
      ...base,
      departing: [b],
      balanceDue: [b],
      guideByItinerary: new Map([['i1', null]]),
    })
    expect(scannedBookings).toBe(1)
    expect(items.map(i => i.type).sort()).toEqual(['balance_due', 'no_guide'])
  })

  it('a cancelled booking is never chased', () => {
    const { items } = buildAttentionItems({
      ...base,
      departing: [booking({ status: 'cancelled', balance_due: 5000, start_date: '2026-09-02' })],
    })
    expect(items).toEqual([])
  })
})
