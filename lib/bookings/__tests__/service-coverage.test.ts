import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { coverageByTrip, type CoverageLine } from '@/lib/bookings/service-coverage'

const line = (over: Partial<CoverageLine>): CoverageLine => ({
  id: Math.random().toString(36).slice(2), booking_id: 'b1', status: 'pending', supplier_name: 'Blue Nile', supplier_type: 'transport',
  service_description: 'Airport pickup', service_date: '2026-11-10', service_time: null, resource_kind: 'supplier',
  assigned_vehicle_plate: null, assigned_guide_name: null, ...over,
})
const TRIP = { b1: 'it1', b2: 'it2' }

describe("a trip's supplier coverage on the calendar", () => {
  it('counts covered, waiting and to-arrange lines; Not needed does not count', () => {
    const c = coverageByTrip([
      line({ status: 'accepted' }), line({ status: 'assigned', assigned_vehicle_plate: 'ABC 1' }), line({ status: 'done' }),
      line({ status: 'requested' }), line({ status: 'pending' }), line({ status: 'expired' }), line({ status: 'cancelled' }),
    ], TRIP, '2026-11-01').it1
    expect([c.total, c.covered, c.waiting, c.open]).toEqual([6, 3, 1, 2])
    expect(c.booking_id).toBe('b1')
  })

  it('flags a line still needing someone within 2 days — not one already past, not a covered one', () => {
    expect(coverageByTrip([line({ service_date: '2026-11-03' })], TRIP, '2026-11-01').it1.attention).toBe(true)
    expect(coverageByTrip([line({ service_date: '2026-11-04' })], TRIP, '2026-11-01').it1.attention).toBe(false)
    expect(coverageByTrip([line({ service_date: '2026-10-31' })], TRIP, '2026-11-01').it1.attention).toBe(false)
    expect(coverageByTrip([line({ status: 'accepted', service_date: '2026-11-01' })], TRIP, '2026-11-01').it1.attention).toBe(false)
    expect(coverageByTrip([line({ status: 'requested', service_date: '2026-11-02' })], TRIP, '2026-11-01').it1.attention).toBe(true)
  })

  it('keys lines by the trip their booking is for, in date and time order, with the car or guide named', () => {
    const c = coverageByTrip([
      line({ booking_id: 'b2', service_date: '2026-11-12', service_time: '14:00:00' }),
      line({ booking_id: 'b2', service_date: '2026-11-12', service_time: '09:00:00', status: 'assigned', assigned_guide_name: 'Ali' }),
      line({ booking_id: 'b9' }), // a booking with no trip
    ], TRIP, '2026-11-01')
    expect(Object.keys(c)).toEqual(['it2'])
    expect(c.it2.lines.map(l => l.time)).toEqual(['09:00', '14:00'])
    expect(c.it2.lines[0]).toMatchObject({ label: 'Assigned', named: 'Ali' })
  })

  it('the route reads this company only, and the calendar works without it', () => {
    const src = readFileSync('app/api/service-bookings/coverage/route.ts', 'utf8')
    expect(src).toContain(".eq('tenant_id', tenant_id)")
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    const cal = readFileSync('app/calendar/page.tsx', 'utf8')
    expect(cal).toContain("coverageData?.success ? coverageData.data : {}")
  })
})
