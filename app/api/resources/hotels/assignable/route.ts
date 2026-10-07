import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { assignableHotels, type AccommodationRateRow } from '@/lib/resources/assignable'

// GET /api/resources/hotels/assignable — one entry per hotel per city, built
// from Rates → Hotels (accommodation_rates holds a row per room type and
// season; lib/resources/assignable.ts). RLS scopes the read to the tenant.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const { data, error } = await auth.supabase!
    .from('accommodation_rates')
    .select('id, property_id, property_name, hotel_name, supplier_name, city, star_rating, is_active')

  if (error) {
    console.error('assignable hotels: read failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not load hotels' }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: assignableHotels((data ?? []) as AccommodationRateRow[]) })
}
