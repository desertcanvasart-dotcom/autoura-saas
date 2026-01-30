import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

// GET /api/partners/[id]/template-data?type=hotel|guide|restaurant|airport_staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is now a Promise
    const { id: partnerId } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (!type) {
      return NextResponse.json({ error: 'Missing partner type' }, { status: 400 })
    }

    let partner: any = null
    let placeholderData: Record<string, string> = {}

    switch (type) {
      case 'hotel':
        const { data: hotel, error: hotelError } = await getSupabase()
          .from('hotel_contacts')
          .select('*')
          .eq('id', partnerId)
          .single()
        
        if (hotelError || !hotel) {
          return NextResponse.json({ error: 'Hotel not found' }, { status: 404 })
        }
        
        partner = hotel
        placeholderData = {
          partner_type: 'Hotel',
          partner_name: hotel.name || '',
          hotel_name: hotel.name || '',
          property_type: hotel.property_type || '',
          star_rating: hotel.star_rating ? `${hotel.star_rating} star` : '',
          contact_person: hotel.contact_person || '',
          partner_email: hotel.email || '',
          partner_phone: hotel.phone || '',
          partner_whatsapp: hotel.whatsapp || '',
          partner_address: hotel.address || '',
          partner_city: hotel.city || '',
        }
        break

      case 'guide':
        const { data: guide, error: guideError } = await getSupabase()
          .from('guides')
          .select('*')
          .eq('id', partnerId)
          .single()
        
        if (guideError || !guide) {
          return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
        }
        
        partner = guide
        placeholderData = {
          partner_type: 'Guide',
          partner_name: guide.name || '',
          guide_name: guide.name || '',
          contact_person: guide.name || '',
          partner_email: guide.email || '',
          partner_phone: guide.phone || '',
          partner_whatsapp: guide.phone || '',
          languages: Array.isArray(guide.languages) ? guide.languages.join(', ') : (guide.languages || ''),
          specialties: Array.isArray(guide.specialties) ? guide.specialties.join(', ') : (guide.specialties || ''),
        }
        break

      case 'restaurant':
        const { data: restaurant, error: restaurantError } = await getSupabase()
          .from('restaurant_contacts')
          .select('*')
          .eq('id', partnerId)
          .single()
        
        if (restaurantError || !restaurant) {
          return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
        }
        
        partner = restaurant
        placeholderData = {
          partner_type: 'Restaurant',
          partner_name: restaurant.name || '',
          restaurant_name: restaurant.name || '',
          restaurant_type: restaurant.restaurant_type || '',
          cuisine_type: restaurant.cuisine_type || '',
          contact_person: restaurant.contact_person || '',
          partner_email: restaurant.email || '',
          partner_phone: restaurant.phone || '',
          partner_whatsapp: restaurant.whatsapp || '',
          partner_address: restaurant.address || '',
          partner_city: restaurant.city || '',
        }
        break

      case 'airport_staff':
        const { data: staff, error: staffError } = await getSupabase()
          .from('airport_staff')
          .select('*')
          .eq('id', partnerId)
          .single()
        
        if (staffError || !staff) {
          return NextResponse.json({ error: 'Airport staff not found' }, { status: 404 })
        }
        
        partner = staff
        placeholderData = {
          partner_type: 'Airport Staff',
          partner_name: staff.name || '',
          staff_name: staff.name || '',
          staff_role: staff.role || '',
          contact_person: staff.name || '',
          partner_email: staff.email || '',
          partner_phone: staff.phone || '',
          partner_whatsapp: staff.whatsapp || '',
          airport_location: staff.airport_location || '',
          languages: Array.isArray(staff.languages) ? staff.languages.join(', ') : (staff.languages || ''),
        }
        break

      default:
        return NextResponse.json({ error: 'Invalid partner type' }, { status: 400 })
    }

    // Add company defaults
    placeholderData.company_name = 'Travel2Egypt'
    placeholderData.agent_name = 'Islam'
    placeholderData.company_email = 'info@travel2egypt.com'
    placeholderData.company_phone = '+20 115 801 1600'
    placeholderData.today = formatDate(new Date())

    return NextResponse.json({
      partner,
      type,
      placeholderData,
    })

  } catch (error: any) {
    console.error('Error fetching partner template data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })
}