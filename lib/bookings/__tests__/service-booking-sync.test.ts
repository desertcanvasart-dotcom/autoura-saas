import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  SUPPLIER_RATE_TABLES, planLineSync, rateKey, withSupplierFromRate, type ExistingServiceRow, type SupplierLine,
} from '@/lib/bookings/booking-suppliers'
import { serviceStart, transitionStamps } from '@/lib/bookings/service-booking-transition'

const line = (o: Partial<SupplierLine>): SupplierLine => ({
  itinerary_service_id: null, supplier_id: null, supplier_type: 'transport', supplier_name: 'Nile Cars',
  service_description: null, service_date: '2027-01-02', service_time: null, pickup_location: null,
  dropoff_location: null, pax: 2, quoted_cost: 40, ...o,
})
const old = (o: Partial<ExistingServiceRow>): ExistingServiceRow => ({
  id: 'r1', itinerary_service_id: null, supplier_id: null, supplier_name: 'Nile Cars', supplier_type: 'transport',
  service_date: '2027-01-02', status: 'pending', confirmation_number: null, confirmed_cost: null, has_expense: false, ...o,
})

describe('one row per service line, replacing the pre-446 rows', () => {
  const lines = [line({ itinerary_service_id: 'a' }), line({ itinerary_service_id: 'b', quoted_cost: 10 })]

  it('a fresh booking gets every line', () => {
    expect(planLineSync(lines, [])).toEqual({ add: lines, replace: [] })
  })

  it('lines already listed are not added twice', () => {
    const plan = planLineSync(lines, [old({ id: 'x', itinerary_service_id: 'a' })])
    expect(plan.add.map(l => l.itinerary_service_id)).toEqual(['b'])
  })

  it('an untouched old supplier-day row is replaced by its lines', () => {
    expect(planLineSync(lines, [old({})])).toEqual({ add: lines, replace: ['r1'] })
  })

  it('an old row someone worked on stays and still covers its lines', () => {
    for (const worked of [{ status: 'accepted' }, { confirmation_number: 'C-1' }, { confirmed_cost: 50 }, { has_expense: true }, { status: 'cancelled' }]) {
      expect(planLineSync(lines, [old(worked)]), JSON.stringify(worked)).toEqual({ add: [], replace: [] })
    }
  })

  it('an untouched old ticket row goes (tickets are no longer listed); one added by hand stays', () => {
    expect(planLineSync([], [old({ id: 't', supplier_type: 'entrance', supplier_name: 'Bab Zuwaila' })]).replace).toEqual(['t'])
    expect(planLineSync(lines, [old({ id: 'h', supplier_name: 'Felucca Ali' })])).toEqual({ add: lines, replace: [] })
  })
})

describe('what a move stamps', () => {
  const now = new Date('2027-01-01T08:00:00Z')

  it('a request sets the reply deadline: 1 h when the service is within 48 h, else 4 h', () => {
    const soon = transitionStamps({ status: 'pending', service_date: '2027-01-02', service_time: '09:00:00' }, 'requested', now)
    expect(soon).toMatchObject({ status: 'requested', requested_at: now.toISOString(), reply_deadline: '2027-01-01T09:00:00.000Z' })
    const later = transitionStamps({ status: 'pending', service_date: '2027-01-10' }, 'requested', now)
    expect(later.reply_deadline).toBe('2027-01-01T12:00:00.000Z')
  })

  it('accepting stamps confirmed_at once; leaving cover clears it', () => {
    expect(transitionStamps({ status: 'requested' }, 'accepted', now).confirmed_at).toBe(now.toISOString())
    expect(transitionStamps({ status: 'accepted' }, 'assigned', now)).not.toHaveProperty('confirmed_at')
    expect(transitionStamps({ status: 'assigned' }, 'assigned', now).assigned_at).toBe(now.toISOString())
    expect(transitionStamps({ status: 'accepted' }, 'pending', now)).toMatchObject({ confirmed_at: null, reply_deadline: null, assigned_at: null })
  })

  it('service start reads the date at its time, else midnight; no date = none', () => {
    expect(serviceStart('2027-01-02', '14:30:00')?.toISOString()).toBe('2027-01-02T14:30:00.000Z')
    expect(serviceStart('2027-01-02', null)?.toISOString()).toBe('2027-01-02T00:00:00.000Z')
    expect(serviceStart(null, '10:00')).toBeNull()
  })
})

describe('one writer of a service booking\'s status', () => {
  const root = path.join(__dirname, '..', '..', '..')
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })

  it('only service-booking-transition updates booking_supplier_status.status', () => {
    const writers = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))].filter(f => {
      const src = fs.readFileSync(f, 'utf8')
      return /from\('booking_supplier_status'\)[\s\S]{0,40}\.update\(/.test(src) && /status\b/.test(src)
    }).map(f => path.relative(root, f))
    // The route updates only cost / confirmation number; the status goes through the transition.
    expect(writers.sort()).toEqual([
      'app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts',
      'app/api/bookings/[id]/suppliers/route.ts',
      'lib/bookings/service-booking-transition.ts',
      'lib/bookings/supplier-answer.ts',
    ])
    const route = fs.readFileSync(path.join(root, 'app/api/bookings/[id]/suppliers/route.ts'), 'utf8')
    expect(route).not.toMatch(/updates\.status\s*=/)
    // Who covers a line changes the supplier or the assignment; the status only through the transition.
    const cover = fs.readFileSync(path.join(root, 'app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts'), 'utf8')
    expect(cover).not.toMatch(/from\('booking_supplier_status'\)\.update\(\{[^}]*\bstatus:/)
    expect(cover).toContain("transitionServiceBooking(supabase, tenant_id, {")
    // A supplier's answer (reply link or their own page) saves the car or
    // guide; the status only through the transition.
    const answer = fs.readFileSync(path.join(root, 'lib/bookings/supplier-answer.ts'), 'utf8')
    expect(answer).not.toMatch(/from\('booking_supplier_status'\)\.update\(\{[^}]*\bstatus:/)
    expect(answer).toContain('transitionServiceBooking(db, tenantId, {')
    for (const route of ['app/api/reply/[token]/route.ts', 'app/api/supplier-page/[token]/lines/[lineId]/route.ts']) {
      expect(fs.readFileSync(path.join(root, route), 'utf8'), route).toContain('applySupplierAnswer(')
    }
  })
})

describe('the supplier comes from the rate that priced the line', () => {
  const rates = new Map([[rateKey('guide_rates', 'g1'), { id: 'sup-amr', name: 'Amr Guiding' }]])

  it('a pinned line takes its rate row\'s supplier; others stay as they are', () => {
    const out = withSupplierFromRate([
      { id: 'a', day_number: 1, service_type: 'guide', service_name: 'Guide Giza', rate_table: 'guide_rates', rate_id: 'g1' },
      { id: 'b', day_number: 1, service_type: 'guide', service_name: 'Guide Saqqara', rate_table: 'guide_rates', rate_id: 'g2' },
      { id: 'c', day_number: 1, service_type: 'guide', supplier_id: 'own', supplier_name: 'Chosen', rate_table: 'guide_rates', rate_id: 'g1' },
    ], rates)
    expect(out.map(s => [s.supplier_id ?? null, s.supplier_name ?? null])).toEqual([
      ['sup-amr', 'Amr Guiding'], [null, null], ['own', 'Chosen'],
    ])
  })

  it('every listed rate sheet really has a supplier_id column (generated types)', () => {
    const types = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'types', 'database.types.ts'), 'utf8')
    for (const t of SUPPLIER_RATE_TABLES) {
      const row = new RegExp(`^ {6}${t}: \\{\\n {8}Row: \\{\\n([\\s\\S]*?)\\n {8}\\}`, 'm').exec(types)
      expect(row?.[1], t).toMatch(/^ {10}supplier_id: string \| null$/m)
    }
  })

  it('an untouched old row named by the service is still replaced once the supplier is known', () => {
    const named = line({ itinerary_service_id: 'a', supplier_id: 'sup-amr', supplier_name: 'Amr Guiding', supplier_type: 'guide' })
    const before = old({ id: 'r1', supplier_name: 'Guide Giza', supplier_type: 'guide' })
    const earlier = new Map([['a', 'name:guide giza|guide|2027-01-02']])
    expect(planLineSync([named], [before], earlier)).toEqual({ add: [named], replace: ['r1'] })
    // …and one someone worked on still covers it.
    expect(planLineSync([named], [{ ...before, status: 'accepted' }], earlier)).toEqual({ add: [], replace: [] })
  })
})
