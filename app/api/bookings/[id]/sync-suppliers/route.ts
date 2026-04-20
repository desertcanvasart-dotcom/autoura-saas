import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// POST - Sync suppliers from linked itinerary services into booking_supplier_status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id: bookingId } = await params

    // Get booking with itinerary link
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, itinerary_id, booking_code, start_date')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }
    if (!booking.itinerary_id) {
      return NextResponse.json({ success: false, error: 'No linked itinerary found' }, { status: 400 })
    }

    // Get itinerary start_date as fallback
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('start_date')
      .eq('id', booking.itinerary_id)
      .single()

    const tripStartDate = booking.start_date || itinerary?.start_date

    // Get itinerary days
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id, date, day_number')
      .eq('itinerary_id', booking.itinerary_id)
      .order('day_number', { ascending: true })

    if (daysError || !days || days.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No itinerary days found',
        data: { added: 0 },
      })
    }

    // Get services for these days
    const dayIds = days.map(d => d.id)
    const { data: services } = await supabase
      .from('itinerary_services')
      .select('*')
      .in('day_id', dayIds)

    if (!services || services.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No services found in itinerary. Save the itinerary first.',
        data: { added: 0 },
      })
    }

    // Check existing to avoid duplicates
    const { data: existing } = await supabase
      .from('booking_supplier_status')
      .select('supplier_name, supplier_type, service_date')
      .eq('booking_id', bookingId)

    const existingKeys = new Set(
      (existing || []).map(s => `${s.supplier_type}|${s.supplier_name}|${s.service_date || 'no-date'}`)
    )

    // Build supplier entries from services
    const entries = services
      .map(service => {
        const day = days.find(d => d.id === service.day_id)
        if (!day) return null

        const supplierName = service.supplier_name || service.service_name || 'Unknown'
        const serviceDate = day.date || (tripStartDate ? calculateDate(tripStartDate, day.day_number) : null)
        const supplierType = mapServiceType(service.service_type)
        const key = `${supplierType}|${supplierName}|${serviceDate || 'no-date'}`

        if (existingKeys.has(key)) return null

        return {
          tenant_id,
          booking_id: bookingId,
          supplier_id: service.supplier_id || null,
          supplier_type: supplierType,
          supplier_name: supplierName,
          service_description: service.notes || service.description || null,
          service_date: serviceDate,
          quoted_cost: service.total_cost || null,
          status: 'pending',
        }
      })
      .filter(Boolean)

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All services already synced',
        data: { added: 0 },
      })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('booking_supplier_status')
      .insert(entries)
      .select()

    if (insertError) {
      console.error('Error inserting supplier statuses:', insertError)
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${inserted?.length || 0} suppliers from itinerary`,
      data: { added: inserted?.length || 0, suppliers: inserted },
    })
  } catch (error) {
    console.error('Sync suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function calculateDate(startDate: string, dayNumber: number): string | null {
  try {
    const d = new Date(startDate)
    d.setDate(d.getDate() + (dayNumber - 1))
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function mapServiceType(type: string | null): string {
  if (!type) return 'other'
  const map: Record<string, string> = {
    hotel: 'hotel', accommodation: 'hotel', guide: 'guide', tour_guide: 'guide',
    transport: 'transport', transportation: 'transport', vehicle: 'transport',
    restaurant: 'restaurant', meal: 'restaurant', activity: 'activity',
    entrance: 'entrance', entrance_fee: 'entrance', ticket: 'entrance',
    cruise: 'cruise', nile_cruise: 'cruise', flight: 'flight', domestic_flight: 'flight',
    train: 'transport', sleeping_train: 'transport', tips: 'other', tip: 'other',
    supplies: 'other', service_fee: 'other', other: 'other',
  }
  return map[type.toLowerCase()] || 'other'
}
