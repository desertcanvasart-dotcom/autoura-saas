import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  try {
    const { dayId } = await params
    const body = await request.json()

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