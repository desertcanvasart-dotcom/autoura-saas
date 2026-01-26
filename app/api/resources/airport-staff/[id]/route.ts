// ============================================
// API Route: /api/resources/airport-staff/[id]/route.ts
// ============================================
// Single airport staff operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Get single airport staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    // Query with RLS - automatically filters by tenant
    const { data, error } = await supabase
      .from('airport_staff')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Airport staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in airport staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update airport staff
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params
    const body = await request.json()

    // Prevent manual tenant_id changes
    delete body.tenant_id

    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.role !== undefined) updateData.role = body.role
    if (body.airport_location !== undefined) updateData.airport_location = body.airport_location
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.email !== undefined) updateData.email = body.email
    if (body.languages !== undefined) updateData.languages = body.languages
    if (body.shift_times !== undefined) updateData.shift_times = body.shift_times
    if (body.emergency_contact !== undefined) updateData.emergency_contact = body.emergency_contact
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // Update with RLS - automatically scoped to tenant
    const { data, error } = await supabase
      .from('airport_staff')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update airport staff' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Airport staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Airport staff updated successfully'
    })

  } catch (error) {
    console.error('Error in airport staff PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete airport staff
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params

    // Delete with RLS - automatically scoped to tenant
    const { error } = await supabase
      .from('airport_staff')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete airport staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Airport staff deleted successfully'
    })

  } catch (error) {
    console.error('Error in airport staff DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}