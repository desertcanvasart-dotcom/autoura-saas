// ============================================
// API Route: /api/resources/airport-staff/[id]/route.ts
// ============================================
// Single airport staff operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - Get single airport staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params

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
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()

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
    const supabase = createClient()
    const { id } = await params

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