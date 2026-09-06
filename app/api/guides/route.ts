// ============================================
// API Route: /api/guides
// ============================================
// Fetches guides from suppliers table (type='guide')
// GET: List all guides (with filters)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const tenant_id = authResult.tenant_id
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const search = searchParams.get('search') || ''
    const is_active = searchParams.get('is_active')
    const active_only = searchParams.get('active_only')
    const availability_from = searchParams.get('availability_from')
    const availability_to = searchParams.get('availability_to')
    const exclude_itinerary_id = searchParams.get('exclude_itinerary_id')
    const with_stats = searchParams.get('with_stats') === 'true'

    // Build query - fetch from suppliers table with supplier_type='guide'
    let query = supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_type', 'guide')
      .eq('tenant_id', tenant_id)
      .order('name', { ascending: true })

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,contact_email.ilike.%${search}%`)
    }

    // Support both is_active and active_only parameters
    if (is_active === 'true' || active_only === 'true') {
      query = query.eq('status', 'active')
    }

    const { data: suppliers, error } = await query

    if (error) {
      console.error('Error fetching guides:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch guides' },
        { status: 500 }
      )
    }

    // Map supplier fields to guide format - use contact_phone for phone
    let guides = (suppliers || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      phone: g.contact_phone || g.whatsapp || g.phone2,
      email: g.contact_email,
      city: g.city,
      languages: g.languages || [],
      specialties: g.specialties || [],
      is_active: g.status === 'active',
      daily_rate: g.daily_rate,
      hourly_rate: g.hourly_rate,
      notes: g.notes,
      contact_phone: g.contact_phone,
      whatsapp: g.whatsapp,
      ...g
    }))



    // If checking availability, filter out guides with conflicting bookings
    if (availability_from && availability_to) {
      let bookingsQuery = supabase
        .from('itineraries')
        .select('assigned_guide_id')
        .eq('tenant_id', tenant_id)
        .not('assigned_guide_id', 'is', null)
        .or(`and(start_date.lte.${availability_to},end_date.gte.${availability_from})`)

      if (exclude_itinerary_id) {
        bookingsQuery = bookingsQuery.neq('id', exclude_itinerary_id)
      }

      const { data: bookings } = await bookingsQuery

      const bookedGuideIds = bookings?.map(b => b.assigned_guide_id) || []
      guides = guides.filter(g => !bookedGuideIds.includes(g.id))
    }

    // Add statistics if requested
    if (with_stats && guides.length > 0) {
      const guidesWithStats = await Promise.all(
        guides.map(async (guide) => {
          const { data: bookings } = await supabase
            .from('itineraries')
            .select('id, start_date, end_date, total_cost')
            .eq('tenant_id', tenant_id)
            .eq('assigned_guide_id', guide.id)

          const now = new Date()
          const activeBookings = bookings?.filter(b =>
            b.start_date !== null && b.end_date !== null &&
            new Date(b.start_date) <= now && new Date(b.end_date) >= now
          ).length || 0

          const upcomingBookings = bookings?.filter(b =>
            b.start_date !== null && new Date(b.start_date) > now
          ).length || 0

          const totalRevenue = bookings?.reduce((sum, b) => sum + (b.total_cost || 0), 0) || 0

          return {
            ...guide,
            active_bookings: activeBookings,
            upcoming_bookings: upcomingBookings,
            total_revenue: totalRevenue,
          }
        })
      )

      return NextResponse.json({ success: true, data: guidesWithStats })
    }

    // Return wrapped format for guide-rates-content
    return NextResponse.json({ success: true, data: guides })

  } catch (error) {
    console.error('Error in guides GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Guide name is required' },
        { status: 400 }
      )
    }

    // Create guide as a supplier. Set BOTH type and supplier_type: the GET
    // list filters on supplier_type, and while a DB trigger mirrors the two,
    // setting both keeps this correct even if that trigger is absent.
    // Note: suppliers has no specialties/daily_rate/hourly_rate columns —
    // guide rates live in guide_rates.
    const guideData: TablesInsert<'suppliers'> = {
      ...rateCurrencyWriteField(body),
      tenant_id: authResult.tenant_id,
      type: 'guide',
      types: ['guide'],
      supplier_type: 'guide',
      name: body.name,
      company_name: body.name,
      contact_email: body.email || null,
      contact_phone: body.phone || body.contact_phone || null,
      whatsapp: body.whatsapp || null,
      city: body.city || null,
      languages: body.languages || [],
      status: body.is_active !== false ? 'active' : 'inactive',
      notes: body.notes || null,
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([guideData])
      .select()
      .single()

    if (error) {
      console.error('Error creating guide:', error)

      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Failed to create guide' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Guide created successfully',
    }, { status: 201 })

  } catch (error) {
    console.error('Error in guides POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}