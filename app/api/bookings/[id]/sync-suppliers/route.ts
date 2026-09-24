import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { syncBookingSuppliers } from '@/lib/bookings/booking-suppliers'

// POST — add the supplier rows the booking's itinerary implies and it does not
// have yet (idempotent). The rules — which lines need a supplier, one row per
// supplier per day — live in lib/bookings/booking-suppliers.ts, shared with
// booking creation, which now fills the list itself.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id: bookingId } = await params
    const result = await syncBookingSuppliers(supabase, tenant_id, bookingId)
    if (!result.ok) {
      const status = result.error === 'Booking not found' ? 404 : 500
      return NextResponse.json({ success: false, error: result.error }, { status })
    }
    return NextResponse.json({
      success: true,
      message: result.added ? `Added ${result.added} supplier${result.added === 1 ? '' : 's'} from the itinerary` : 'Every supplier is already listed',
      data: { added: result.added },
    })
  } catch (error) {
    console.error('Sync suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
