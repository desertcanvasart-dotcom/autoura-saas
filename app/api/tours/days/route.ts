import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all days (optionally filter by tour_id)
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { searchParams } = new URL(request.url)
    const tourId = searchParams.get('tour_id')

    let query = supabase
      .from('tour_days')
      .select(`
        *,
        activities:tour_day_activities(*),
        accommodation:hotel_contacts(id, name, city),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, city),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, city),
        guide:guides(id, name, languages)
      `)
      .order('day_number', { ascending: true })

    if (tourId) {
      query = query.eq('tour_id', tourId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching days:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch days' },
        { status: 500 }
      )
    }

    // Sort activities by activity_order
    const daysWithSortedActivities = data?.map(day => ({
      ...day,
      activities: day.activities?.sort((a: any, b: any) =>
        (a.activity_order || 0) - (b.activity_order || 0)
      ) || []
    }))

    return NextResponse.json({
      success: true,
      data: daysWithSortedActivities || [],
      count: daysWithSortedActivities?.length || 0
    })

  } catch (error) {
    console.error('Error in days GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new day
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    if (!body.tour_id || !body.day_number || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Tour ID, day number, and city are required' },
        { status: 400 }
      )
    }

    // Verify tour template belongs to this tenant
    const { data: template } = await supabase
      .from('tour_templates')
      .select('id, tenant_id')
      .eq('id', body.tour_id)
      .single()

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Tour template not found or access denied' },
        { status: 404 }
      )
    }

    if (template.tenant_id !== tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot create day for tour from another tenant' },
        { status: 403 }
      )
    }

    const dayData = {
      tenant_id, // ✅ Explicit tenant_id
      tour_id: body.tour_id,
      day_number: body.day_number,
      city: body.city,
      accommodation_id: body.accommodation_id || null,
      breakfast_included: body.breakfast_included || false,
      lunch_meal_id: body.lunch_meal_id || null,
      dinner_meal_id: body.dinner_meal_id || null,
      guide_required: body.guide_required || false,
      guide_id: body.guide_id || null,
      notes: body.notes || null
    }

    const { data, error } = await supabase
      .from('tour_days')
      .insert([dayData])
      .select()
      .single()

    if (error) {
      console.error('Error creating day:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Day created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in days POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}