import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// ============================================
// ACTIVITY SINGLE OPERATIONS
// File: app/api/tours/activities/[id]/route.ts
// ============================================

// GET - Get single activity
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('tour_day_activities')
      .select(`
        *,
        entrance:attractions(id, name, city, entrance_fee_eur, entrance_fee_non_eur),
        transportation:transportation_rates(id, vehicle_type, city, rate_per_day)
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Activity not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in activity GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update activity
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}
    
    if (body.activity_order !== undefined) updateData.activity_order = body.activity_order
    if (body.entrance_id !== undefined) updateData.entrance_id = body.entrance_id
    if (body.transportation_id !== undefined) updateData.transportation_id = body.transportation_id
    if (body.activity_notes !== undefined) updateData.activity_notes = body.activity_notes

    const { data, error } = await supabase
      .from('tour_day_activities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating activity:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Activity updated successfully'
    })

  } catch (error) {
    console.error('Error in activity PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete activity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params

    const { error } = await supabase
      .from('tour_day_activities')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting activity:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted successfully'
    })

  } catch (error) {
    console.error('Error in activity DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}