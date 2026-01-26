import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Get single day with activities
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('tour_days')
      .select(`
        *,
        activities:tour_day_activities(*),
        accommodation:hotel_contacts(id, name, city),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, city),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, city),
        guide:guides(id, name, languages)
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Day not found' },
        { status: 404 }
      )
    }

    // Sort activities by activity_order
    data.activities = data.activities?.sort((a: any, b: any) =>
      (a.activity_order || 0) - (b.activity_order || 0)
    ) || []

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in day GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update day
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS will enforce tenant boundaries
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const body = await request.json()

    const updateData: any = {}

    if (body.day_number !== undefined) updateData.day_number = body.day_number
    if (body.city !== undefined) updateData.city = body.city
    if (body.accommodation_id !== undefined) updateData.accommodation_id = body.accommodation_id
    if (body.breakfast_included !== undefined) updateData.breakfast_included = body.breakfast_included
    if (body.lunch_meal_id !== undefined) updateData.lunch_meal_id = body.lunch_meal_id
    if (body.dinner_meal_id !== undefined) updateData.dinner_meal_id = body.dinner_meal_id
    if (body.guide_required !== undefined) updateData.guide_required = body.guide_required
    if (body.guide_id !== undefined) updateData.guide_id = body.guide_id
    if (body.notes !== undefined) updateData.notes = body.notes

    // Do NOT include tenant_id in update (prevents tenant switching)
    delete updateData.tenant_id

    const { data, error } = await supabase
      .from('tour_days')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating day:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Day updated successfully'
    })

  } catch (error) {
    console.error('Error in day PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete day (and its activities)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS policies enforce manager role
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult

    // Delete activities first (RLS enforced)
    await supabase
      .from('tour_day_activities')
      .delete()
      .eq('tour_day_id', id)

    // Delete day (RLS enforced)
    const { error } = await supabase
      .from('tour_days')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting day:', error)
      // RLS will return error if not manager role or wrong tenant
      if (error.code === 'PGRST116' || error.message?.includes('permission')) {
        return NextResponse.json(
          { success: false, error: 'Day not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { success: false, error: 'Failed to delete day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Day deleted successfully'
    })

  } catch (error) {
    console.error('Error in day DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}