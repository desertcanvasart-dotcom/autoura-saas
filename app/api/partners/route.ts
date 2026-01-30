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

// GET /api/partners?type=hotel|guide|restaurant|airport_staff&search=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // hotel, guide, restaurant, airport_staff, or 'all'
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')

    const partners: any[] = []

    // Fetch based on type or fetch all
    const fetchTypes = type && type !== 'all' 
      ? [type] 
      : ['hotel', 'guide', 'restaurant', 'airport_staff']

    for (const partnerType of fetchTypes) {
      let data: any[] = []

      switch (partnerType) {
        case 'hotel':
          const { data: hotels } = await (getSupabase() as any)
            .from('hotel_contacts')
            .select('id, name, property_type, city, contact_person, phone, email, whatsapp, address, star_rating')
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(limit)
          
          data = (hotels || []).map(h => ({
            id: h.id,
            type: 'hotel',
            name: h.name,
            subtype: h.property_type,
            city: h.city,
            contact_person: h.contact_person,
            phone: h.phone,
            email: h.email,
            whatsapp: h.whatsapp,
            address: h.address,
            extra: { star_rating: h.star_rating }
          }))
          break

        case 'guide':
          const { data: guides } = await (getSupabase() as any)
            .from('guides')
            .select('id, name, phone, email, languages, specialties, daily_rate, hourly_rate')
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(limit)
          
          data = (guides || []).map(g => ({
            id: g.id,
            type: 'guide',
            name: g.name,
            subtype: 'Tour Guide',
            city: null,
            contact_person: g.name,
            phone: g.phone,
            email: g.email,
            whatsapp: g.phone,
            address: null,
            extra: { 
              languages: g.languages, 
              specialties: g.specialties,
              daily_rate: g.daily_rate,
              hourly_rate: g.hourly_rate
            }
          }))
          break

        case 'restaurant':
          const { data: restaurants } = await (getSupabase() as any)
            .from('restaurant_contacts')
            .select('id, name, restaurant_type, cuisine_type, city, contact_person, phone, email, whatsapp, address')
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(limit)
          
          data = (restaurants || []).map(r => ({
            id: r.id,
            type: 'restaurant',
            name: r.name,
            subtype: r.restaurant_type,
            city: r.city,
            contact_person: r.contact_person,
            phone: r.phone,
            email: r.email,
            whatsapp: r.whatsapp,
            address: r.address,
            extra: { cuisine_type: r.cuisine_type }
          }))
          break

        case 'airport_staff':
          const { data: airportStaff } = await (getSupabase() as any)
            .from('airport_staff')
            .select('id, name, role, airport_location, phone, email, whatsapp, languages')
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(limit)
          
          data = (airportStaff || []).map(a => ({
            id: a.id,
            type: 'airport_staff',
            name: a.name,
            subtype: a.role,
            city: a.airport_location,
            contact_person: a.name,
            phone: a.phone,
            email: a.email,
            whatsapp: a.whatsapp,
            address: a.airport_location,
            extra: { languages: a.languages }
          }))
          break
      }

      partners.push(...data)
    }

    // Filter by search if provided
    let filteredPartners = partners
    if (search) {
      const searchLower = search.toLowerCase()
      filteredPartners = partners.filter(p => 
        p.name?.toLowerCase().includes(searchLower) ||
        p.contact_person?.toLowerCase().includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower) ||
        p.city?.toLowerCase().includes(searchLower)
      )
    }

    return NextResponse.json({ partners: filteredPartners })

  } catch (error: any) {
    console.error('Error fetching partners:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}