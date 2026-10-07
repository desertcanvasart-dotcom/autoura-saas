import { describe, it, expect } from 'vitest'
import { defaultTab, nextAction, tripAttention, tripSteps, type TripFacts } from '@/lib/itineraries/trip-stage'

const facts = (over: Partial<TripFacts> = {}): TripFacts => ({
  status: 'draft', hasBooking: false, hasInvoice: false, invoiced: null, paid: null,
  startDate: '2026-11-01', endDate: '2026-11-04', today: '2026-10-06', ...over,
})

describe('the next thing to do', () => {
  it('walks the trip from quote to close', () => {
    expect(nextAction(facts())?.kind).toBe('send_quote')
    expect(nextAction(facts({ status: 'sent' }))).toEqual({ kind: 'convert', label: 'Convert to booking' })
    expect(nextAction(facts({ status: 'confirmed' }))).toEqual({ kind: 'convert', label: 'Create booking' })
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true }))?.kind).toBe('create_invoice')
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 2349.5, paid: 1000 }))?.kind).toBe('record_payment')
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 2349.5, paid: 2349.5 }))?.kind).toBe('assign_resources')
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 100, paid: 100, today: '2026-11-02' }))?.kind).toBe('open_trip_log')
  })

  it('a trip that has ended is closed out, whatever else is open', () => {
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true, today: '2026-11-05' }))).toEqual({ kind: 'close_out', label: 'Close out trip' })
  })

  it('nothing for a cancelled or completed trip', () => {
    expect(nextAction(facts({ status: 'cancelled' }))).toBeNull()
    expect(nextAction(facts({ status: 'completed' }))).toBeNull()
  })
})

describe('the steps', () => {
  // Live ITN-S-2026-8987: confirmed, booked, invoiced; ended 4 Oct.
  it('a booked, invoiced trip that ended: quoted to invoiced done, paid is where it stands', () => {
    const steps = tripSteps(facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 2349.5, paid: 0, startDate: '2026-10-01', endDate: '2026-10-04' }))
    expect(steps.map(s => [s.key, s.done, s.current])).toEqual([
      ['quoted', true, false], ['confirmed', true, false], ['booked', true, false],
      ['invoiced', true, false], ['paid', false, true], ['operated', true, false], ['closed', false, false],
    ])
  })

  it('ran and paid in full: Closed is the next step; closing it out completes the row', () => {
    const ran = { hasBooking: true, hasInvoice: true, invoiced: 2349.5, paid: 2349.5, startDate: '2026-10-01', endDate: '2026-10-04' }
    expect(tripSteps(facts({ status: 'confirmed', ...ran })).find(s => s.current)?.key).toBe('closed')
    const closed = tripSteps(facts({ status: 'completed', ...ran }))
    expect(closed.every(s => s.done)).toBe(true)
    expect(closed.some(s => s.current)).toBe(false)
  })

  it('closed but still owing: Paid stays open — closing says nothing about the money', () => {
    const steps = tripSteps(facts({ status: 'completed', hasBooking: true, hasInvoice: true, invoiced: 1000, paid: 400, endDate: '2026-10-04' }))
    expect(steps.find(s => s.key === 'paid')).toMatchObject({ done: false, current: true })
    expect(steps.find(s => s.key === 'closed')?.done).toBe(true)
  })

  it('a booking means it was quoted and confirmed, even if the status lagged', () => {
    const steps = tripSteps(facts({ status: 'draft', hasBooking: true }))
    expect(steps.filter(s => s.done).map(s => s.key)).toEqual(['quoted', 'confirmed', 'booked'])
    expect(steps.find(s => s.current)?.key).toBe('invoiced')
  })
})

describe('what needs attention', () => {
  const base = { currency: 'EUR', staleNights: [], cruiseNotes: [] }

  it('a night whose hotel left the rates, and a cruise date, come first', () => {
    const a = tripAttention({ ...facts(), ...base, staleNights: [{ day: 1, property: 'Marriott Mena House', switchedOff: false }], cruiseNotes: ['Day 3: the ship does not sail on Wednesday.'] })
    expect(a).toEqual([
      { severity: 'warning', message: 'Day 1: Marriott Mena House is no longer in your rates — it was removed after this trip was priced.', action: { kind: 'go_to_day', label: 'Go to day 1', day: 1 } },
      { severity: 'warning', message: 'Day 3: the ship does not sail on Wednesday.' },
    ])
  })

  it('no invoice, or money still owed, close to the start', () => {
    expect(tripAttention({ ...facts({ status: 'confirmed', hasBooking: true, today: '2026-10-25' }), ...base })[0])
      .toEqual({ severity: 'warning', message: 'The trip starts in 7 days and has no invoice.', action: { kind: 'create_invoice', label: 'Create invoice' } })
    expect(tripAttention({ ...facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 2349.5, paid: 1000, today: '2026-10-31' }), ...base })[0].message)
      .toBe('The trip starts in 1 day with EUR 1349.50 still unpaid.')
    // Far from the start, or paid in full: nothing.
    expect(tripAttention({ ...facts({ status: 'confirmed', hasBooking: true }), ...base })).toEqual([])
    expect(tripAttention({ ...facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 10, paid: 10, today: '2026-10-31' }), ...base })).toEqual([])
  })

  it('a trip that ended and is still open', () => {
    expect(tripAttention({ ...facts({ status: 'confirmed', hasBooking: true, today: '2026-11-05' }), ...base })).toEqual([
      { severity: 'info', message: 'The trip ended on 2026-11-04 and is still marked confirmed.', action: { kind: 'close_out', label: 'Close out trip' } },
    ])
  })

  it('nothing on a cancelled trip', () => {
    expect(tripAttention({ ...facts({ status: 'cancelled' }), ...base, cruiseNotes: ['x'] })).toEqual([])
  })
})

describe('which section opens', () => {
  it('before the trip its days, while it runs its operations, after it its money', () => {
    expect(defaultTab(facts({ today: '2026-10-06' }))).toBe('itinerary')
    expect(defaultTab(facts({ today: '2026-11-02' }))).toBe('operations')
    expect(defaultTab(facts({ today: '2026-11-05' }))).toBe('finance')
    expect(defaultTab(facts({ status: 'cancelled', today: '2026-11-05' }))).toBe('itinerary')
  })
})
