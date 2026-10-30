import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { coverageByTrip, type CoverageLine } from '@/lib/bookings/service-coverage'

// ============================================
// Supplier coverage per trip, for the operations calendar
// ============================================
// lib/bookings/service-coverage. The company's service lines (RLS + an
// explicit tenant filter), keyed by the trip (itinerary) their booking is for.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

  const { data: lines, error } = await supabase
    .from('booking_supplier_status')
    .select('id, booking_id, status, supplier_name, supplier_type, service_description, service_date, service_time, resource_kind, assigned_vehicle_plate, assigned_guide_name')
    .eq('tenant_id', tenant_id)
    .neq('status', 'cancelled')
    .limit(5000)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const bookingIds = [...new Set((lines ?? []).map(l => l.booking_id as string))]
  const { data: bookings, error: bErr } = bookingIds.length
    ? await supabase.from('bookings').select('id, itinerary_id').in('id', bookingIds).eq('tenant_id', tenant_id)
    : { data: [], error: null }
  if (bErr) return NextResponse.json({ success: false, error: bErr.message }, { status: 500 })
  const tripOf: Record<string, string> = {}
  for (const b of bookings ?? []) if (b.itinerary_id) tripOf[b.id as string] = b.itinerary_id as string

  const today = new Date().toISOString().slice(0, 10)
  return NextResponse.json({ success: true, data: coverageByTrip((lines ?? []) as CoverageLine[], tripOf, today) })
}
