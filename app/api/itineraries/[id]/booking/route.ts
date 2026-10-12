import { NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { roleAllows } from '@/lib/api-role-gate'
import { createBookingOnConfirm } from '@/lib/bookings/create-booking-on-confirm'

/**
 * POST /api/itineraries/[id]/booking — book a CONFIRMED itinerary that has
 * no booking yet.
 *
 * Confirming an itinerary books it (PUT /api/itineraries/[id]). This is the
 * same step for an itinerary confirmed before that rule, or whose booking
 * could not be made at the time (e.g. no price yet): the itinerary page's
 * "Create Booking" button. One implementation — createBookingOnConfirm —
 * which never makes a second booking for an itinerary.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // RLS scopes the read to the caller's tenant: a foreign id is not found.
    const supabase = await createAuthenticatedClient()
    const { id } = await params

    const { data: itinerary, error } = await supabase
      .from('itineraries')
      // What createBookingOnConfirm reads (ItineraryForBooking + tenant/client).
      .select('id, tenant_id, client_id, status, trip_name, client_name, start_date, end_date, total_days, num_adults, num_children, num_travelers, selling_price, currency')
      .eq('id', id)
      .maybeSingle()
    if (error || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }
    if (itinerary.status !== 'confirmed') {
      return NextResponse.json(
        { success: false, error: 'Only a confirmed itinerary is booked — confirm it first' },
        { status: 409 }
      )
    }

    // "Book anyway" over a full or closed day: managers and admins only.
    const body = await request.json().catch(() => ({})) as { override_capacity?: unknown }
    const auth = body.override_capacity === true ? await requireAuth() : null
    const overrideCapacity = auth !== null && auth.error === null && roleAllows(auth.role, 'manage')
    const { booking, note, capacityFull } = await createBookingOnConfirm(id, itinerary as Record<string, unknown>, { overrideCapacity })
    if (!booking) {
      return NextResponse.json({ success: false, error: note ?? 'Booking not created', ...(capacityFull ? { capacity_full: true } : {}) }, { status: 409 })
    }
    return NextResponse.json({ success: true, booking })
  } catch (err) {
    console.error('POST /api/itineraries/[id]/booking failed:', err)
    return NextResponse.json({ success: false, error: 'Failed to create booking' }, { status: 500 })
  }
}
