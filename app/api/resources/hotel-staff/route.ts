// ============================================
// API Route: /api/resources/hotel-staff/route.ts
// ============================================
// Hotel staff collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all hotel staff with hotel info
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotel_id')
    const isActive = searchParams.get('is_active')

    // Query with RLS - automatically filters by tenant
    let query = supabase
      .from('hotel_staff')
      .select(`
        *,
        hotel:hotel_contacts(id, name, city)
      `)
      .order('name', { ascending: true })

    if (hotelId) {
      query = query.eq('hotel_id', hotelId)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch hotel staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in hotel staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new hotel staff
export async function POST(request: NextRequest) {
  try {
    // Authenticate user and get Supabase client
    const authResult = await requireAuth()

    if (authResult.error) {
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status: authResult.status })
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Prevent manual tenant_id setting - RLS will handle it
    delete body.tenant_id

    if (!body.name || !body.phone) {
      return NextResponse.json(
        { success: false, error: 'Name and phone are required' },
        { status: 400 }
      )
    }

    const staffData = {
      name: body.name,
      role: body.role || null,
      hotel_id: body.hotel_id || null,
      phone: body.phone,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      languages: body.languages || [],
      shift_times: body.shift_times || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    // Insert with RLS - tenant_id auto-populated by trigger
    const { data, error } = await supabase
      .from('hotel_staff')
      .insert([staffData])
      .select(`
        *,
        hotel:hotel_contacts(id, name, city)
      `)
      .single()

    if (error) {
      console.error('Error creating hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create hotel staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel staff created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in hotel staff POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}