import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { dayId } = await params
    const body = await request.json()

    // RLS will ensure user can only update their tenant's days
    const { data, error } = await supabase
      .from('itinerary_days')
      .update({
        city: body.city,
        title: body.title,
        description: body.description,
        overnight_city: body.overnight_city
      })
      .eq('id', dayId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating day:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update day',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}