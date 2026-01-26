// ============================================
// API Route: /api/resources/airport-staff/route.ts
// ============================================
// Airport staff collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all airport staff
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
    const location = searchParams.get('location')
    const isActive = searchParams.get('is_active')

    // ✅ MULTI-TENANT: RLS policies automatically filter by tenant_id
    // Only returns airport staff belonging to authenticated user's tenant
    let query = supabase
      .from('airport_staff')
      .select('*')
      .order('name', { ascending: true })

    if (location) {
      query = query.ilike('airport_location', `%${location}%`)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch airport staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in airport staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new airport staff
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
    const body = await request.json()

    // ✅ MULTI-TENANT: Prevent client from manipulating tenant_id
    // tenant_id will be auto-populated by database trigger from authenticated user's session
    // This ensures data isolation - users cannot create records in other tenants
    delete body.tenant_id

    if (!body.name || !body.airport_location || !body.phone) {
      return NextResponse.json(
        { success: false, error: 'Name, airport location, and phone are required' },
        { status: 400 }
      )
    }

    const staffData = {
      name: body.name,
      role: body.role || null,
      airport_location: body.airport_location,
      phone: body.phone,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      languages: body.languages || [],
      shift_times: body.shift_times || null,
      emergency_contact: body.emergency_contact || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    // ✅ MULTI-TENANT: tenant_id is auto-populated by database trigger
    // The trigger automatically sets tenant_id from the authenticated user's session
    // RLS policies enforce that users can only insert staff for their own tenant
    const { data, error } = await supabase
      .from('airport_staff')
      .insert([staffData])
      .select()
      .single()

    if (error) {
      console.error('Error creating airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create airport staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Airport staff created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in airport staff POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}