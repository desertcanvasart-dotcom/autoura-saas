// The 2026-10-30 click-through of the live app, as tests.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { humanService, lineService, lineSupplier, SUPPLIER_KINDS_FOR_LINE } from '@/lib/bookings/service-label'
import { supplierLinesFromServices } from '@/lib/bookings/booking-suppliers'
import { buildServiceRequestMessage, toSupplierView } from '@/lib/supplier-reply-link'
import { buildClientDayMessage } from '@/lib/bookings/client-day-message'

const read = (p: string) => readFileSync(p, 'utf8')

describe('a line with no supplier never borrows the service name', () => {
  it('the builder keeps the service as the description and leaves the supplier empty', () => {
    const [l] = supplierLinesFromServices([{ id: 's1', service_type: 'transportation', service_name: 'day_tour sedan Cairo', total_cost: 38.88, day_number: 2 }] as never, '2026-11-01', 4)
    expect(l.supplier_name).toBe('')
    expect(l.service_description).toBe('day_tour sedan Cairo')
  })

  it('a named supplier keeps its name', () => {
    const [l] = supplierLinesFromServices([{ id: 's1', service_type: 'guide', service_name: 'English Cairo', supplier_name: 'Amr Guiding', supplier_id: 'g1', day_number: 1 }] as never, '2026-11-01')
    expect(l).toMatchObject({ supplier_name: 'Amr Guiding', service_description: 'English Cairo' })
  })

  it('rate codes read as words; no name = no supplier', () => {
    expect(humanService('day_tour sedan Cairo')).toBe('Day tour sedan Cairo')
    expect(humanService('Philae Temple')).toBe('Philae Temple')
    expect(lineService({ service_description: null, supplier_type: 'transport' })).toBe('Transfer')
    expect(lineSupplier({ supplier_name: '  ' })).toBeNull()
  })

  it('the request greets "Hello there" and names the service in words — never "Hello day_tour"', () => {
    const m = buildServiceRequestMessage({ supplierName: lineSupplier({ supplier_name: '' }), service: 'day_tour sedan Cairo', replyHours: 4, assign: 'car', url: 'u' })
    expect(m.startsWith('Hello there,')).toBe(true)
    expect(m).toContain('🧾 Day tour sedan Cairo')
    const v = toSupplierView({}, {}, { supplier_name: '', service_description: 'day_tour sedan Cairo', supplier_type: 'transport' })
    expect(v).toMatchObject({ supplierName: '', service: 'Day tour sedan Cairo' })
  })

  it("the client's day message names each service in words", () => {
    const m = buildClientDayMessage({ date: '2026-11-02', isTomorrow: false, lines: [{ id: 'a', status: 'pending', service_date: '2026-11-02', service_time: '09:00', service_description: 'airport_transfer sedan Cairo', supplier_type: 'transport', pickup_location: null, dropoff_location: null, assigned_vehicle_plate: null, assigned_guide_name: null, assigned_guide_phone: null, driver_note: null }] })
    expect(m).toContain('🕘 09:00 · Airport transfer sedan Cairo')
  })

  it('a line with no supplier cannot be requested — the screen says to choose who covers it', () => {
    expect(read('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts')).toContain('Choose who covers this line first')
    expect(read('components/booking/BookingSuppliersPanel.tsx')).toContain('No supplier yet')
  })
})

describe('Who covers it offers every supplier of the kind', () => {
  it('transport lines match transport companies', () => {
    expect(SUPPLIER_KINDS_FOR_LINE.transport).toContain('transport_company')
  })
  it('as a separate "no rate" group, with no made-up cost', () => {
    const cover = read('app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts')
    expect(cover).toContain('otherSuppliers')
    expect(cover).toMatch(/cost: null,\s*no_cost_reason: 'no rate for this service/)
    expect(read('components/booking/CoverLinePicker.tsx')).toContain('Other suppliers of this kind')
  })
})

describe('the office sets time and pickup on a line', () => {
  it('the suppliers route takes time (HH:MM), pickup and drop-off', () => {
    const r = read('app/api/bookings/[id]/suppliers/route.ts')
    expect(r).toContain('updates.service_time = t || null')
    expect(r).toContain("for (const f of ['pickup_location', 'dropoff_location'] as const)")
  })
})

describe('a supplier answering before the office pressed Yes', () => {
  it('counts: the request is marked sent first, then the answer', () => {
    const a = read('lib/bookings/supplier-answer.ts')
    expect(a).toContain("if (normalizeStatus(line.status) === 'pending')")
    expect(a.indexOf("to: 'requested'")).toBeLessThan(a.indexOf('transitionServiceBooking(db, tenantId, { id: line.id, bookingId, to, ...who, note })'))
  })
})

describe('supplier and traveller pages carry no app chrome', () => {
  it('no menu, no support chat on /reply, /supplier, /portal, sign-in and home', () => {
    const shell = read('app/ClientShell.tsx')
    for (const p of ["'/reply/'", "'/supplier/'", "'/portal/'", "'/supplier-login'", "'/supplier-home'"]) expect(shell).toContain(p)
  })
  it('history says Autoura for the system, not "Migration 446"', () => {
    expect(read('components/booking/LineHistory.tsx')).toContain("e.actor_kind === 'system' ? WHO.system")
  })
})
