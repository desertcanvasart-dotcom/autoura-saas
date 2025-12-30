import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// Generate unique itinerary code
function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000 // 4-digit random
  return `ITN-${year}-${random}`
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    console.log('✅ Found itineraries:', data?.length || 0)

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    // Generate itinerary_code if not provided
    if (!body.itinerary_code) {
      body.itinerary_code = generateItineraryCode()
    }

    // Set default status if not provided
    if (!body.status) {
      body.status = 'draft'
    }

    // Set created_at and updated_at
    const now = new Date().toISOString()
    body.created_at = body.created_at || now
    body.updated_at = now

    const { data, error } = await supabase
      .from('itineraries')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating itinerary:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}