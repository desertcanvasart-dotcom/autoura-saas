import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

// An itinerary can't be deleted while any booking points at it, cancelled or
// not (bookings.itinerary_id is ON DELETE RESTRICT). The API could already
// delete a cancelled booking with no payments, but no screen called it, so a
// test itinerary that once had a booking could never be cleaned up.
describe('a cancelled booking can be deleted from its page', () => {
  const page = read('app/bookings/[id]/page.tsx')

  it('offers Delete only on a cancelled booking with no payments, for managers and up', () => {
    expect(page).toContain("(isAdmin || isManager) && booking.status === 'cancelled' && payments.length === 0")
    expect(page).toContain('Delete booking')
  })

  it('asks first, calls the booking DELETE, then goes back to the itinerary', () => {
    expect(page).toContain("variant: 'danger'")
    expect(page).toContain("fetch(`/api/bookings/${booking.id}`, { method: 'DELETE' })")
    expect(page).toContain('`/itineraries/${booking.itineraries.id}`')
  })

  it('the API still refuses confirmed bookings and bookings with payments', () => {
    const api = read('app/api/bookings/[id]/route.ts')
    expect(api).toContain("['confirmed', 'paid_full', 'in_progress'].includes(booking.status)")
    expect(api).toContain('This booking has payments recorded')
  })
})
