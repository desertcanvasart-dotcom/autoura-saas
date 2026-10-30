import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  supplierBacking, supplierTypeFor, supplierLinesFromServices, serviceDate, type ServiceForSupplier,
} from '@/lib/bookings/booking-suppliers'
import { checkStatusChange, normalizeStatusChoice, statusChoiceOf } from '@/lib/bookings/booking-status'

// Step 2 of the booking work (compared with travel-ops-pro, 2026-09-25): a
// status control, and a Suppliers tab that is filled and checked.

const svc = (o: Partial<ServiceForSupplier>): ServiceForSupplier => ({ day_number: 1, ...o })

describe('which lines need a supplier', () => {
  it('tips, water, supplies, fees, tickets and "other" are left off', () => {
    for (const t of ['tip', 'tips', 'water', 'supplies', 'service_fee', 'other', 'entrance_fee', 'ticket', null, 'nonsense']) {
      expect(supplierTypeFor(t)).toBeNull()
    }
    expect(supplierTypeFor('transportation')).toBe('transport')
    expect(supplierTypeFor('accommodation')).toBe('hotel')
  })

  it('ITN-S-2026-6386 shape: water and tickets vanish; one row per service line (446)', () => {
    const services: ServiceForSupplier[] = [
      ...Array.from({ length: 11 }, (_, i) => svc({ service_type: 'other', service_name: 'Other (Per Person)', day_number: i + 1 })),
      svc({ id: 'a', service_type: 'transportation', service_name: 'airport_transfer sedan Cairo', total_cost: 94.67, day_number: 1, pickup_time: '14:30:00', pickup_location: 'CAI T2' }),
      svc({ id: 'b', service_type: 'transfer', service_name: 'full_service CAI', total_cost: 11.83, day_number: 1 }),
      svc({ id: 'c', service_type: 'entrance_fee', service_name: 'Bab Zuwaila', total_cost: 10.14, day_number: 2 }),
      // the same supplier twice on one day → two lines, each its own booking
      svc({ id: 'd', service_type: 'transportation', supplier_id: 's1', supplier_name: 'Cairo Transport', service_name: 'Hotel → Giza', total_cost: 40, day_number: 3 }),
      svc({ id: 'e', service_type: 'transportation', supplier_id: 's1', supplier_name: 'Cairo Transport', service_name: 'Giza → Hotel', total_cost: 10, day_number: 3 }),
    ]
    const lines = supplierLinesFromServices(services, '2026-11-01', 2)
    expect(lines.map(l => [l.itinerary_service_id, l.service_date, l.supplier_name, l.quoted_cost])).toEqual([
      ['b', '2026-11-01', 'full_service CAI', 11.83],
      ['a', '2026-11-01', 'airport_transfer sedan Cairo', 94.67],
      ['d', '2026-11-03', 'Cairo Transport', 40],
      ['e', '2026-11-03', 'Cairo Transport', 10],
    ])
    expect(lines[1]).toMatchObject({ service_time: '14:30:00', pickup_location: 'CAI T2', pax: 2 })
    expect(lines[2].service_description).toBe('Hotel → Giza')
  })

  it('a grid cruise line (saved as accommodation) is a cruise supplier', () => {
    const [line] = supplierLinesFromServices([svc({ service_type: 'accommodation', description: '[pricing-grid:cruise] MS X', service_name: 'MS X' })], null)
    expect(line.supplier_type).toBe('cruise')
  })

  it('service dates: the day’s own date, else start + (day − 1), else none', () => {
    expect(serviceDate(3, '2026-12-05', '2026-11-01')).toBe('2026-12-05')
    expect(serviceDate(3, null, '2026-11-30')).toBe('2026-12-02')
    expect(serviceDate(3, null, null)).toBeNull()
  })
})

describe('supplier backing', () => {
  it('an empty list is not backing; "not needed" rows do not count', () => {
    expect(supplierBacking([]).backed).toBe(false)
    expect(supplierBacking([{ status: 'confirmed' }, { status: 'cancelled' }])).toEqual({ total: 1, confirmed: 1, backed: true })
    expect(supplierBacking([{ status: 'cancelled' }]).backed).toBe(false)
    expect(supplierBacking([{ status: 'confirmed' }, { status: 'contacted' }])).toEqual({ total: 2, confirmed: 1, backed: false })
    expect(supplierBacking([{ status: 'assigned' }, { status: 'done' }, { status: 'cancelled' }]).backed).toBe(true)
  })
})

describe('status changes', () => {
  it('payment statuses are never typed in — they mean "active"', () => {
    for (const s of ['pending_deposit', 'confirmed', 'paid_full', 'active']) expect(normalizeStatusChoice(s)).toBe('active')
    expect(normalizeStatusChoice('in_progress')).toBe('in_progress')
    expect(normalizeStatusChoice('supplier_confirmed')).toBeNull()
    expect(statusChoiceOf('paid_full')).toBe('active')
    expect(statusChoiceOf('cancelled')).toBe('cancelled')
  })
  it('in progress / completed need the suppliers confirmed — or a recorded override', () => {
    const half = [{ status: 'confirmed' }, { status: 'pending' }]
    const refused = checkStatusChange('in_progress', half, false)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.message).toBe('1 of 2 suppliers are confirmed. Confirm the rest, or go ahead anyway.')
    expect(checkStatusChange('completed', [], false).ok).toBe(false)
    expect(checkStatusChange('in_progress', half, true)).toMatchObject({ ok: true, overridden: true })
    expect(checkStatusChange('in_progress', [{ status: 'confirmed' }], false)).toMatchObject({ ok: true, overridden: false })
  })
  it('cancel and reopen never need suppliers', () => {
    expect(checkStatusChange('cancelled', [], false).ok).toBe(true)
    expect(checkStatusChange('active', [], false).ok).toBe(true)
  })
})

describe('wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
  it('PATCH enforces the rule, records an override, and hands "active" back to the money', () => {
    const src = read('app/api/bookings/[id]/route.ts')
    expect(src).toContain('checkStatusChange(choice, supplierRows, status_override_ack === true)')
    expect(src).toContain("updates.total_paid = current.total_paid ?? 0 // fires the status trigger")
    expect(src).toMatch(/updates\.status_override = check\.overridden/)
  })
  it('both ways of creating a booking list its suppliers', () => {
    expect(read('lib/bookings/create-booking-on-confirm.ts')).toContain('syncBookingSuppliers(admin, tenantId,')
    expect(read('app/api/bookings/from-quote/route.ts')).toContain('syncBookingSuppliers(adminClient, tenant_id,')
  })
  it('the dead supplier_confirmed promotion is gone', () => {
    expect(read('app/api/bookings/[id]/suppliers/route.ts')).not.toContain('supplier_confirmed')
  })
})
