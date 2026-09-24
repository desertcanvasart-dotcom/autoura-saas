import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
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
  _request: Request,
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

    const { booking, note } = await createBookingOnConfirm(id, itinerary as Record<string, unknown>)
    if (!booking) {
      return NextResponse.json({ success: false, error: note ?? 'Booking not created' }, { status: 409 })
    }
    return NextResponse.json({ success: true, booking })
  } catch (err) {
    console.error('POST /api/itineraries/[id]/booking failed:', err)
    return NextResponse.json({ success: false, error: 'Failed to create booking' }, { status: 500 })
  }
}
