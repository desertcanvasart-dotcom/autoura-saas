// app/api/cruises/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    
    const isActive = searchParams.get('is_active')
    const cruiseType = searchParams.get('cruise_type')
    const route = searchParams.get('route')
    
    let query = supabase
      .from('nile_cruises')
      .select('*')
      .order('ship_name', { ascending: true })

    if (isActive === 'true') {
      query = query.eq('is_active', true)
    } else if (isActive === 'false') {
      query = query.eq('is_active', false)
    }

    if (cruiseType) {
      query = query.eq('ship_category', cruiseType)
    }

    if (route) {
      query = query.eq('route_name', route)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cruises' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { data, error } = await supabase
      .from('nile_cruises')
      .insert(body)
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error creating cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create cruise' },
      { status: 500 }
    )
  }
}