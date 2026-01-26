import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all activities (optionally filter by tour_day_id)
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { searchParams } = new URL(request.url)
    const dayId = searchParams.get('tour_day_id')

    let query = supabase
      .from('tour_day_activities')
      .select(`
        *,
        entrance:attractions(id, name, city, entrance_fee_eur, entrance_fee_non_eur),
        transportation:transportation_rates(id, vehicle_type, city, rate_per_day)
      `)
      .order('activity_order', { ascending: true })

    if (dayId) {
      query = query.eq('tour_day_id', dayId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching activities:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch activities' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in activities GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new activity
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
    const body = await request.json()

    if (!body.tour_day_id) {
      return NextResponse.json(
        { success: false, error: 'Day ID is required' },
        { status: 400 }
      )
    }

    // Verify tour day belongs to this tenant
    const { data: day } = await supabase
      .from('tour_days')
      .select('id, tenant_id')
      .eq('id', body.tour_day_id)
      .single()

    if (!day) {
      return NextResponse.json(
        { success: false, error: 'Tour day not found or access denied' },
        { status: 404 }
      )
    }

    if (day.tenant_id !== tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot create activity for day from another tenant' },
        { status: 403 }
      )
    }

    // Get max activity_order for this day if not provided
    let activityOrder = body.activity_order
    if (activityOrder === null || activityOrder === undefined) {
      const { data: existingActivities } = await supabase
        .from('tour_day_activities')
        .select('activity_order')
        .eq('tour_day_id', body.tour_day_id)
        .order('activity_order', { ascending: false })
        .limit(1)

      activityOrder = existingActivities && existingActivities.length > 0
        ? (existingActivities[0].activity_order || 0) + 1
        : 1
    }

    const activityData = {
      tenant_id, // ✅ Explicit tenant_id
      tour_day_id: body.tour_day_id,
      activity_order: activityOrder,
      entrance_id: body.entrance_id || null,
      transportation_id: body.transportation_id || null,
      activity_notes: body.activity_notes || null
    }

    const { data, error } = await supabase
      .from('tour_day_activities')
      .insert([activityData])
      .select()
      .single()

    if (error) {
      console.error('Error creating activity:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Activity created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in activities POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}