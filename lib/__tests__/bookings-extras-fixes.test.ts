import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { extraInputError } from '@/lib/extras-catalogue-input'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

// Sell-group bugs, 2026-10-11.
describe('the portal lock', () => {
  it('the office can lock and unlock the travellers’ details', () => {
    const r = src('app/api/bookings/[id]/portal-link/route.ts')
    expect(r).toContain('export async function PATCH(')
    expect(r).toContain('.update({ form_locked: body.locked })')
    expect(r).toContain('export async function GET(')
    expect(src('app/bookings/[id]/page.tsx')).toContain("{portalLock.locked ? 'Unlock details' : 'Lock details'}")
  })

  it('the portal link is absolute even without NEXT_PUBLIC_APP_URL', () => {
    expect(src('app/api/bookings/[id]/portal-link/route.ts')).toContain('process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin')
  })
})

describe('the booking page', () => {
  const page = src('app/bookings/[id]/page.tsx')
  it('statuses read as words, in the header and the payment toast', () => {
    expect(page).toContain("paid_full: 'Paid in full'")
    expect(page).toContain('{statusLabel(booking.status)}')
    expect(page).toContain('Booking: ${statusLabel(data.booking_status)}')
  })
  it('the payment bar stays 0–100 and is 0 with no total', () => {
    expect(page).toContain('const paymentProgress = booking.total_amount > 0')
    expect(page).toContain('Math.min(100, Math.max(0,')
  })
  it('change requests show on the passengers tab only', () => {
    expect(page).toContain("{activeTab === 'passengers' && changeRequests.some(cr => cr.status === 'pending') && (")
  })
})

describe('the bookings list', () => {
  it('counts every booking, whatever the status filter', () => {
    const page = src('app/bookings/page.tsx')
    expect(page).not.toContain("params.append('status', statusFilter)")
    expect(page).toContain("if (statusFilter !== 'all' && booking.status !== statusFilter) return false")
  })
})

describe('moving a trip moves its booking', () => {
  it('new itinerary dates move the days and the bookings', () => {
    const r = src('app/api/itineraries/[id]/route.ts')
    expect(r).toContain(".from('bookings')\n        .update({ start_date: start,")
    expect(r).toContain('date: shiftDateISO(start, (d.day_number ?? 1) - 1)')
  })
})

describe('extras', () => {
  it('a catalogue extra needs a known unit and no negative money', () => {
    expect(extraInputError({ unit: 'per_night' })).toContain('Unit')
    expect(extraInputError({ supplier_cost: -5 })).toContain('cannot be negative')
    expect(extraInputError({ selling_price: -1 })).toContain('cannot be negative')
    expect(extraInputError({ unit: 'per_person', selling_price: 0, supplier_cost: null })).toBeNull()
    expect(src('app/api/extras-catalogue/[id]/route.ts')).toContain('extraInputError(record)')
    expect(src('app/api/extras-catalogue/route.ts')).toContain('extraInputError(record)')
  })

  it('a portal double-tap is caught per link, without maybeSingle', () => {
    const r = src('app/api/portal/[token]/extras/route.ts')
    expect(r).toContain("dupQuery.eq('passenger_id', link.passenger_id) : dupQuery.is('passenger_id', null)")
    expect(r).toContain('await dupQuery.limit(1)')
  })
})
