import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { hotelTierFindings, transportTypeFindings } from '@/lib/rates/rate-checks'

// ============================================
// GET /api/rates/check — rates likely saved under the wrong category
// ============================================
// Read-only: hotels whose tier does not fit their star rating, and transport
// whose type contradicts its route or name (lib/rates/rate-checks.ts). RLS
// keeps both reads to the caller's company.

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult

    const [hotels, transport] = await Promise.all([
      fetchAllPages((from, to) => supabase
        .from('accommodation_rates')
        .select('id, property_name, hotel_name, city, tier, star_rating')
        .eq('is_active', true)
        .order('id')
        .range(from, to)),
      fetchAllPages((from, to) => supabase
        .from('transportation_rates')
        .select('id, route_name, service_type, vehicle_type, city, origin_city, destination_city')
        .eq('is_active', true)
        .order('id')
        .range(from, to)),
    ])
    const error = hotels.error ?? transport.error
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      data: {
        hotels: hotelTierFindings(hotels.data),
        transport: transportTypeFindings(transport.data),
      },
    })
  } catch (error) {
    console.error('GET /api/rates/check error:', error)
    return NextResponse.json({ success: false, error: 'Could not check rates' }, { status: 500 })
  }
}
