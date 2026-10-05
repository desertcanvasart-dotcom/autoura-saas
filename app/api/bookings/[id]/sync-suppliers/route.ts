import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { syncBookingSuppliers } from '@/lib/bookings/booking-suppliers'
import { syncSupplierExpense } from '@/lib/bookings/supplier-expense'

// POST — add the supplier rows the booking's itinerary implies and it does not
// have yet (idempotent). The rules — which lines need a supplier, one row per
// supplier per day — live in lib/bookings/booking-suppliers.ts, shared with
// booking creation, which now fills the list itself.
//
// It also records the expense for any confirmed row that has none yet —
// rows confirmed before confirmation made expenses (lib/bookings/
// supplier-expense) catch up here.
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
    const { data: confirmed } = await supabase
      .from('booking_supplier_status')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('status', 'confirmed')
    let expensesAdded = 0
    for (const row of confirmed || []) {
      const r = await syncSupplierExpense(supabase, tenant_id, row.id as string)
      if (r.ok && r.action === 'create') expensesAdded++
      else if (!r.ok) console.error('[sync-suppliers] expense for', row.id, r.error)
    }

    const parts = [
      result.added ? `Added ${result.added} supplier${result.added === 1 ? '' : 's'} from the itinerary` : 'Every supplier is already listed',
      expensesAdded ? `recorded ${expensesAdded} expense${expensesAdded === 1 ? '' : 's'} for confirmed suppliers` : '',
    ].filter(Boolean)
    return NextResponse.json({
      success: true,
      message: parts.join('; '),
      data: { added: result.added, expenses_added: expensesAdded },
    })
  } catch (error) {
    console.error('Sync suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
